/**
 * Traka Config Rules
 * ============================================================================
 * Validates loaded Traka product config files (.cfg / .ini / .config).
 *
 * Auto-detects which Traka product a config file belongs to from filename and
 * content signature, parses the document (XML / JSON / INI) into a queryable
 * tree with a line map, then runs the enabled rules from RULE_REGISTRY against
 * it and returns ConfigFinding objects that the host app surfaces inline on
 * the Config Viewer and on the Issues page.
 *
 * The host (js/app.js) only ever talks to the public surface exposed on the
 * window.TrakaConfigRules namespace.
 */
(function () {
    'use strict';

    // ========================================================================
    // Public types (informal — JSDoc only)
    // ========================================================================
    /**
     * @typedef {Object} ConfigFinding
     * @property {string} ruleId
     * @property {'error'|'warning'|'info'} severity
     * @property {string} title       Short human title.
     * @property {string} message     Plain-text explanation of what's wrong.
     * @property {string} [hint]      Suggested fix.
     * @property {number} [line]      1-based line number in the source file.
     * @property {string} [valuePath] Logical path inside the doc (for display).
     * @property {string} productId
     */

    /**
     * @typedef {Object} ParsedConfig
     * @property {'xml'|'json'|'ini'|'unknown'} format
     * @property {*} tree         Parsed tree (Document for xml, Object for json/ini).
     * @property {string[]} lines Raw lines.
     * @property {string} raw     Raw text.
     * @property {string|null} parseError
     */

    // ========================================================================
    // Product detection
    // ========================================================================
    /** Ordered: most-specific filenames first. */
    const FILENAME_PATTERNS = [
        { productId: 'onguard',       re: /(^|[\\/])onguardservice\.cfg$/i,                          score: 90, reason: 'Filename matches legacy OnGuardService.cfg' },
        { productId: 'onguard',       re: /traka\.integration\.onguard.*\.cfg$/i,                    score: 95, reason: 'Filename matches Traka.Integration.OnGuard.cfg' },
        { productId: 'ccure',         re: /traka\.integration\.ccure.*\.cfg$/i,                      score: 95, reason: 'Filename matches Traka.Integration.CCURE9000.cfg' },
        { productId: 'postbox',       re: /traka\.integration\.postbox.*\.(cfg|config|json)$/i,      score: 90, reason: 'Filename matches Traka.Integration.Postbox' },
        { productId: 'ie_service',    re: /traka\.integration\.service\.exe\.config$/i,              score: 90, reason: 'Filename matches Traka.Integration.Service.exe.config' },
        { productId: 'ie_monitor',    re: /traka\.integration\.monitor\.exe\.config$/i,              score: 90, reason: 'Filename matches Traka.Integration.Monitor.exe.config' },
        { productId: 'ie_restapi',    re: /traka\.integration\.restapi.*\.config$/i,                 score: 85, reason: 'Filename matches Traka.Integration.RestApi config' },
        { productId: 'ie_service',    re: /traka\.integration\.service.*\.config$/i,                 score: 70, reason: 'Filename suggests Traka Integration Service config' },
        { productId: 'ie_monitor',    re: /traka\.integration\.monitor.*\.config$/i,                 score: 70, reason: 'Filename suggests Traka Integration Monitor config' },
    ];

    /**
     * @param {string} fileName
     * @param {string} rawText
     * @returns {{ productId: string, confidence: number, reasons: string[] }}
     */
    function detectConfigProduct(fileName, rawText) {
        const reasons = [];
        const scores = Object.create(null);

        const bump = (id, score, reason) => {
            scores[id] = (scores[id] || 0) + score;
            reasons.push(`[${id} +${score}] ${reason}`);
        };

        // Filename heuristics
        for (const p of FILENAME_PATTERNS) {
            if (p.re.test(fileName || '')) bump(p.productId, p.score, p.reason);
        }

        const sample = (rawText || '').slice(0, 8 * 1024);

        // Content signatures
        if (/\b<configuration\b[\s\S]*<system\.serviceModel\b/i.test(sample)) {
            bump('ie_service', 25, 'Content has <configuration>/<system.serviceModel>');
        }
        if (/<add\s+key="ApplicationName"\s+value="IE"/i.test(sample)) {
            bump('ie_service', 20, 'appSettings ApplicationName=IE present');
            bump('ie_monitor', 20, 'appSettings ApplicationName=IE present');
        }
        if (/WSHttpBinding_IIntegrationService/i.test(sample)) {
            bump('ie_monitor', 25, 'Single IIntegrationService binding (Monitor shape)');
        }
        if (/WSHttpBinding_IAdminService[\s\S]*WSHttpBinding_ICommsService/i.test(sample)) {
            bump('ie_service', 25, 'Multiple BusinessEngine bindings (Service shape)');
        }
        if (/"OnGuard"\s*:\s*\{/.test(sample) || /"DirectoryName"\s*:/i.test(sample)) {
            bump('onguard', 30, 'JSON object contains "OnGuard"/"DirectoryName"');
        }
        if (/"OnGuardWebService"\s*:\s*\{/i.test(sample)) {
            bump('onguard', 30, 'JSON object contains "OnGuardWebService" (legacy v3.6)');
        }
        if (/"TrakaCardIdFormat"\s*:/i.test(sample) || /"ImportClearancePrefix"\s*:/i.test(sample) || /"UDFItemAccessPrefix"\s*:/i.test(sample)) {
            bump('ccure', 30, 'JSON has CCURE-style fields (Clearance/UDF/CardIdFormat)');
        }
        if (/"BadgeLayouts"\s*:/i.test(sample) || /"OrphanCheck"\s*:/i.test(sample)) {
            bump('ccure', 15, 'JSON has BadgeLayouts/OrphanCheck (CCURE)');
        }

        // Pick the winner
        let bestId = 'unknown';
        let bestScore = 0;
        for (const id of Object.keys(scores)) {
            if (scores[id] > bestScore) {
                bestScore = scores[id];
                bestId = id;
            }
        }

        // Fallback to a generic format pack if nothing scored
        if (bestId === 'unknown') {
            const trimmed = (rawText || '').trim();
            if (trimmed.startsWith('<')) bestId = 'generic_xml';
            else if (trimmed.startsWith('{') || trimmed.startsWith('[')) bestId = 'generic_json';
            else bestId = 'unknown';
        }

        return { productId: bestId, confidence: bestScore, reasons: reasons };
    }

    // ========================================================================
    // Parsers
    // ========================================================================
    /**
     * Try JSON first, then XML, then INI/KV. Returns a uniform shape regardless
     * of which one succeeded so rules can branch on `format`.
     * @param {string} productId
     * @param {string} rawText
     * @returns {ParsedConfig}
     */
    function parseConfigDocument(productId, rawText) {
        const lines = (rawText || '').split(/\r?\n/);
        const result = { format: 'unknown', tree: null, lines: lines, raw: rawText || '', parseError: null };

        // OnGuard cfgs are JSON-despite-extension. Try JSON first if it looks JSON.
        const trimmed = (rawText || '').trim();
        const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
        const looksXml = trimmed.startsWith('<');

        const tryJson = () => {
            try {
                const cleaned = stripJsonExtras(rawText || '');
                result.tree = JSON.parse(cleaned);
                result.format = 'json';
                return true;
            } catch (e) {
                result.parseError = 'JSON parse error: ' + e.message;
                return false;
            }
        };
        const tryXml = () => {
            try {
                if (typeof DOMParser === 'undefined') return false;
                const dom = new DOMParser().parseFromString(rawText || '', 'application/xml');
                const err = dom.getElementsByTagName('parsererror')[0];
                if (err) {
                    result.parseError = 'XML parse error: ' + (err.textContent || '').slice(0, 200);
                    return false;
                }
                result.tree = dom;
                result.format = 'xml';
                return true;
            } catch (e) {
                result.parseError = 'XML parse error: ' + e.message;
                return false;
            }
        };
        const tryIni = () => {
            try {
                result.tree = parseIni(rawText || '');
                result.format = 'ini';
                return true;
            } catch (e) {
                result.parseError = 'INI parse error: ' + e.message;
                return false;
            }
        };

        if (looksJson) {
            if (tryJson()) return result;
            if (tryXml()) return result;
        } else if (looksXml) {
            if (tryXml()) return result;
            if (tryJson()) return result;
        } else {
            if (tryIni()) return result;
            if (tryJson()) return result;
            if (tryXml()) return result;
        }

        return result;
    }

    /** Strip line/block comments and trailing commas so JSON.parse is forgiving. */
    function stripJsonExtras(src) {
        let out = '';
        let i = 0;
        const n = src.length;
        let inStr = false;
        let strCh = '';
        let prevCh = '';
        while (i < n) {
            const ch = src[i];
            const next = src[i + 1];
            if (inStr) {
                out += ch;
                if (ch === '\\') {
                    out += next;
                    i += 2;
                    continue;
                }
                if (ch === strCh) inStr = false;
                i++;
                continue;
            }
            if (ch === '"' || ch === '\'') {
                inStr = true;
                strCh = ch;
                out += ch;
                i++;
                continue;
            }
            if (ch === '/' && next === '/') {
                while (i < n && src[i] !== '\n') i++;
                continue;
            }
            if (ch === '/' && next === '*') {
                i += 2;
                while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
                i += 2;
                continue;
            }
            out += ch;
            prevCh = ch;
            i++;
        }
        // Strip trailing commas before ] or }
        out = out.replace(/,\s*([}\]])/g, '$1');
        return out;
    }

    /** Tiny INI/KV parser: { sections: { [name]: { [key]: value } }, root: { ... } }. */
    function parseIni(src) {
        const root = {};
        const sections = {};
        let current = root;
        const linesLocal = src.split(/\r?\n/);
        for (let i = 0; i < linesLocal.length; i++) {
            const line = linesLocal[i].trim();
            if (!line || line.startsWith('#') || line.startsWith(';')) continue;
            const sec = line.match(/^\[(.+?)\]\s*$/);
            if (sec) {
                const name = sec[1].trim();
                if (!sections[name]) sections[name] = {};
                current = sections[name];
                continue;
            }
            const eq = line.indexOf('=');
            if (eq > 0) {
                const k = line.slice(0, eq).trim();
                const v = line.slice(eq + 1).trim();
                current[k] = v;
            }
        }
        return { root: root, sections: sections };
    }

    // ========================================================================
    // Helpers used by rule check() functions
    // ========================================================================

    /**
     * Find the 1-based line number of the first line containing all of the
     * supplied substrings (case-insensitive). Returns 0 if none match.
     */
    function findLineWith(parsed, substrings) {
        if (!parsed || !parsed.lines) return 0;
        const needles = (Array.isArray(substrings) ? substrings : [substrings])
            .map(s => String(s).toLowerCase());
        for (let i = 0; i < parsed.lines.length; i++) {
            const lower = parsed.lines[i].toLowerCase();
            if (needles.every(n => lower.includes(n))) return i + 1;
        }
        return 0;
    }

    /** Walk an arbitrary JSON tree and return the first node where the given
     *  key is set (case-sensitive), plus that key's line number in the source. */
    function jsonFindKey(parsed, key) {
        if (!parsed || parsed.format !== 'json' || !parsed.tree) return null;
        const found = jsonFindKeyDeep(parsed.tree, key);
        if (!found) return null;
        const line = findLineWith(parsed, ['"' + key + '"']);
        return { value: found.value, line: line };
    }
    function jsonFindKeyDeep(obj, key) {
        if (!obj || typeof obj !== 'object') return null;
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return { value: obj[key] };
        }
        for (const k of Object.keys(obj)) {
            const child = obj[k];
            if (child && typeof child === 'object') {
                const r = jsonFindKeyDeep(child, key);
                if (r) return r;
            }
        }
        return null;
    }

    /** Get a value at a dotted path, e.g. "Options.OnGuard.DirectoryName". */
    function jsonAtPath(tree, path) {
        if (!tree || !path) return undefined;
        const parts = path.split('.');
        let cur = tree;
        for (const p of parts) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[p];
        }
        return cur;
    }

    /** XML helpers ---------------------------------------------------------- */
    function xmlAll(doc, selector) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return [];
        try { return Array.from(doc.querySelectorAll(selector)); } catch (e) { return []; }
    }
    function xmlFirst(doc, selector) { return xmlAll(doc, selector)[0] || null; }

    /**
     * Tag-name traversal that survives parsers that don't fully support CSS
     * combinators (notably `>`). Returns all elements whose tag matches the
     * final segment AND whose ancestor chain matches the earlier segments.
     */
    function xmlAllByPath(doc, segments) {
        if (!doc) return [];
        const last = segments[segments.length - 1];
        const candidates = doc.getElementsByTagName ? Array.from(doc.getElementsByTagName(last)) : [];
        return candidates.filter(el => {
            // Walk up parents matching the earlier segments in reverse.
            let cur = el.parentNode;
            for (let i = segments.length - 2; i >= 0; i--) {
                while (cur && (!cur.tagName || cur.nodeType !== 1)) cur = cur.parentNode;
                if (!cur || cur.tagName !== segments[i]) return false;
                cur = cur.parentNode;
            }
            return true;
        });
    }

    function makeFinding(rule, productId, opts) {
        return {
            ruleId: rule.id,
            productId: productId,
            severity: rule.severity || 'warning',
            title: rule.title,
            message: (opts && opts.message) || rule.title,
            hint: (opts && opts.hint) || rule.hint || '',
            line: (opts && opts.line) || 0,
            valuePath: (opts && opts.valuePath) || ''
        };
    }

    // ========================================================================
    // Rule packs
    // ========================================================================
    const RULE_REGISTRY = [];

    // ---- Integration Engine - Service ---------------------------------------
    RULE_REGISTRY.push({
        product: 'ie_service',
        productLabel: 'Integration Engine — Service (App.config)',
        defaultEnabled: true,
        rules: [
            {
                id: 'ie_service.application-name.missing',
                title: 'appSettings ApplicationName is not "IE"',
                severity: 'warning',
                hint: 'The Integration Engine service expects <add key="ApplicationName" value="IE" /> under <appSettings>.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const el = xmlFirst(parsed.tree, 'configuration > appSettings > add[key="ApplicationName"]');
                    if (!el) {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<appSettings']) || 1,
                            message: 'appSettings/ApplicationName entry is missing.'
                        })];
                    }
                    if (el.getAttribute('value') !== 'IE') {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['ApplicationName']) || 1,
                            message: 'ApplicationName is "' + el.getAttribute('value') + '" but should be "IE".'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ie_service.entity-framework-section.missing',
                title: '<configSections> is missing the entityFramework section',
                severity: 'warning',
                hint: 'Without this section the EF runtime cannot read its config and the service will fail to start.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const sec = xmlFirst(parsed.tree, 'configuration > configSections > section[name="entityFramework"]');
                    if (sec) return [];
                    return [makeFinding(this, 'ie_service', {
                        line: findLineWith(parsed, ['<configSections']) || 1
                    })];
                }
            },
            {
                id: 'ie_service.startup.runtime',
                title: '<startup> is not pinned to .NET Framework 4.8',
                severity: 'warning',
                hint: 'IE expects <supportedRuntime sku=".NETFramework,Version=v4.8" />.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const sr = xmlFirst(parsed.tree, 'configuration > startup > supportedRuntime');
                    if (!sr) {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<startup']) || 1,
                            message: '<startup>/<supportedRuntime> element is missing.'
                        })];
                    }
                    const sku = sr.getAttribute('sku') || '';
                    if (!/v4\.8/.test(sku)) {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<supportedRuntime']) || 1,
                            message: 'supportedRuntime sku is "' + sku + '" — expected ".NETFramework,Version=v4.8".'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ie_service.endpoints.host-mismatch',
                title: 'Business Engine endpoints point at multiple hosts',
                severity: 'error',
                hint: 'Every <endpoint address="https://HOST:PORT/..."> should target the same Business Engine host.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const endpoints = xmlAllByPath(parsed.tree, ['configuration', 'system.serviceModel', 'client', 'endpoint']);
                    const hosts = new Set();
                    let firstLine = 0;
                    for (const ep of endpoints) {
                        const addr = ep.getAttribute('address') || '';
                        const m = addr.match(/^https?:\/\/([^/:]+)/i);
                        if (m) hosts.add(m[1].toLowerCase());
                        if (!firstLine) firstLine = findLineWith(parsed, [addr]);
                    }
                    if (hosts.size <= 1) return [];
                    return [makeFinding(this, 'ie_service', {
                        line: firstLine || findLineWith(parsed, ['<client']) || 1,
                        message: 'Endpoints reference ' + hosts.size + ' distinct hosts: ' + Array.from(hosts).join(', ') + '.'
                    })];
                }
            },
            {
                id: 'ie_service.default-proxy-missing',
                title: '<system.net>/<defaultProxy enabled="false"> is missing',
                severity: 'info',
                hint: 'Without this, WCF calls can be silently routed via a system proxy and time out.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const proxy = xmlFirst(parsed.tree, 'configuration > system\\.net > defaultProxy');
                    if (!proxy) {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<system.net']) || 1
                        })];
                    }
                    if (proxy.getAttribute('enabled') !== 'false') {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<defaultProxy']) || 1,
                            message: '<defaultProxy enabled="' + proxy.getAttribute('enabled') + '"> — expected "false".'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ie_service.endpoint-port.consistent',
                title: 'BusinessEngine endpoints use a non-standard port',
                severity: 'info',
                hint: 'TrakaWeb business engine port defaults to 10501. A different port is fine if intentional, but worth confirming.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const endpoints = xmlAllByPath(parsed.tree, ['configuration', 'system.serviceModel', 'client', 'endpoint']);
                    const ports = new Set();
                    for (const ep of endpoints) {
                        const addr = ep.getAttribute('address') || '';
                        const m = addr.match(/^https?:\/\/[^/:]+:(\d+)/i);
                        if (m) ports.add(m[1]);
                    }
                    if (!ports.size) return [];
                    if (ports.size === 1 && ports.has('10501')) return [];
                    if (ports.size > 1) {
                        return [makeFinding(this, 'ie_service', {
                            line: findLineWith(parsed, ['<client']) || 1,
                            message: 'Endpoints reference multiple ports: ' + Array.from(ports).join(', ') + '.'
                        })];
                    }
                    return [makeFinding(this, 'ie_service', {
                        line: findLineWith(parsed, ['<client']) || 1,
                        message: 'Endpoints use port ' + Array.from(ports)[0] + ' instead of the default 10501.'
                    })];
                }
            },
            {
                id: 'ie_service.endpoint-scheme.insecure',
                title: 'BusinessEngine endpoints use plain HTTP',
                severity: 'warning',
                hint: 'WCF endpoints should be HTTPS. Plain HTTP exposes credentials to anyone on the network.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const endpoints = xmlAllByPath(parsed.tree, ['configuration', 'system.serviceModel', 'client', 'endpoint']);
                    const httpEndpoints = endpoints.filter(ep => /^http:\/\//i.test(ep.getAttribute('address') || ''));
                    if (!httpEndpoints.length) return [];
                    return [makeFinding(this, 'ie_service', {
                        line: findLineWith(parsed, ['<client']) || 1,
                        message: httpEndpoints.length + ' endpoint(s) use http:// — expected https://.'
                    })];
                }
            },
            {
                id: 'ie_service.binding.untransport-secure',
                title: 'WSHttpBinding security mode is not "TransportWithMessageCredential"',
                severity: 'warning',
                hint: 'The Integration Service ships with TransportWithMessageCredential by default. A different mode usually means SSL was disabled during a copy/paste edit.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const bindings = xmlAllByPath(parsed.tree, ['configuration', 'system.serviceModel', 'bindings', 'wsHttpBinding', 'binding']);
                    const bad = [];
                    for (const b of bindings) {
                        const sec = (b.getElementsByTagName ? Array.from(b.getElementsByTagName('security')) : []).filter(s => s.parentNode === b)[0];
                        if (!sec) continue;
                        const mode = sec.getAttribute('mode');
                        if (mode && mode !== 'TransportWithMessageCredential') {
                            bad.push(b.getAttribute('name') + ' (' + mode + ')');
                        }
                    }
                    if (!bad.length) return [];
                    return [makeFinding(this, 'ie_service', {
                        line: findLineWith(parsed, ['<bindings']) || 1,
                        message: 'Binding(s) with non-default security mode: ' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? ', …' : '') + '.'
                    })];
                }
            }
        ]
    });

    // ---- Integration Engine - Monitor ---------------------------------------
    RULE_REGISTRY.push({
        product: 'ie_monitor',
        productLabel: 'Integration Engine — Monitor (App.config)',
        defaultEnabled: true,
        rules: [
            {
                id: 'ie_monitor.application-name.missing',
                title: 'appSettings ApplicationName is not "IE"',
                severity: 'warning',
                hint: 'The Monitor expects <add key="ApplicationName" value="IE" /> under <appSettings>.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const el = xmlFirst(parsed.tree, 'configuration > appSettings > add[key="ApplicationName"]');
                    if (!el || el.getAttribute('value') !== 'IE') {
                        return [makeFinding(this, 'ie_monitor', {
                            line: findLineWith(parsed, ['ApplicationName']) || findLineWith(parsed, ['<appSettings']) || 1
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ie_monitor.unobserved-task-exceptions',
                title: '<ThrowUnobservedTaskExceptions enabled="true"> is missing',
                severity: 'info',
                hint: 'Recommended in Monitor configs so async exceptions surface in logs instead of being swallowed.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const el = xmlFirst(parsed.tree, 'configuration > runtime > ThrowUnobservedTaskExceptions');
                    if (!el || el.getAttribute('enabled') !== 'true') {
                        return [makeFinding(this, 'ie_monitor', {
                            line: findLineWith(parsed, ['<runtime']) || 1
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ie_monitor.integration-endpoint.shape',
                title: 'IIntegrationService endpoint URL looks malformed',
                severity: 'error',
                hint: 'Expected something like https://<host>:10501/IntegrationEngineService.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const ep = xmlFirst(parsed.tree, 'configuration > system\\.serviceModel > client > endpoint[contract="BusinessEngine.IIntegrationService"]');
                    if (!ep) return [];
                    const addr = ep.getAttribute('address') || '';
                    if (!/^https?:\/\/[^/]+:\d+\/[^\s]+/i.test(addr)) {
                        return [makeFinding(this, 'ie_monitor', {
                            line: findLineWith(parsed, [addr]) || findLineWith(parsed, ['<endpoint']) || 1,
                            message: 'IIntegrationService address is "' + addr + '" — expected scheme://host:port/path.'
                        })];
                    }
                    return [];
                }
            }
        ]
    });

    // ---- Integration Engine - REST API --------------------------------------
    RULE_REGISTRY.push({
        product: 'ie_restapi',
        productLabel: 'Integration Engine — REST API (app.config)',
        defaultEnabled: true,
        rules: [
            {
                id: 'ie_restapi.startup.runtime',
                title: '<startup>/<supportedRuntime> is missing or wrong',
                severity: 'warning',
                hint: 'REST API expects .NET Framework 4.8.',
                check(parsed) {
                    if (parsed.format !== 'xml') return [];
                    const sr = xmlFirst(parsed.tree, 'configuration > startup > supportedRuntime');
                    if (!sr) {
                        return [makeFinding(this, 'ie_restapi', {
                            line: findLineWith(parsed, ['<startup']) || 1
                        })];
                    }
                    const sku = sr.getAttribute('sku') || '';
                    if (!/v4\.8/.test(sku)) {
                        return [makeFinding(this, 'ie_restapi', {
                            line: findLineWith(parsed, ['<supportedRuntime']) || 1,
                            message: 'supportedRuntime sku is "' + sku + '" — expected ".NETFramework,Version=v4.8".'
                        })];
                    }
                    return [];
                }
            }
        ]
    });

    // ---- CCURE9000 ---------------------------------------------------------
    RULE_REGISTRY.push({
        product: 'ccure',
        productLabel: 'CCURE 9000 integration',
        defaultEnabled: true,
        rules: [
            {
                id: 'ccure.import-mode.mutually-exclusive',
                title: 'More than one import mode is enabled',
                severity: 'error',
                hint: 'Pick exactly one of ImportAll, ImportByClearance, or ImportSelectedUsers.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const flags = ['ImportAll', 'ImportByClearance', 'ImportSelectedUsers'];
                    const enabled = flags.filter(f => jsonFindKeyDeep(parsed.tree, f) && jsonFindKeyDeep(parsed.tree, f).value === true);
                    if (enabled.length <= 1) return [];
                    return [makeFinding(this, 'ccure', {
                        line: findLineWith(parsed, ['"' + enabled[0] + '"']) || 1,
                        message: 'These import modes are all true: ' + enabled.join(', ') + '. Only one should be enabled.'
                    })];
                }
            },
            {
                id: 'ccure.groups-vs-udf.conflict',
                title: 'Group import and UDF item-access are both configured',
                severity: 'warning',
                hint: 'These are alternative ways to assign access. Use Clearance Groups OR UDF item access prefixes, not both.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const groups = jsonFindKeyDeep(parsed.tree, 'ImportClearanceGroups');
                    const udf    = jsonFindKeyDeep(parsed.tree, 'UDFItemAccessPrefix');
                    const groupsOn = groups && groups.value === true;
                    const udfOn = udf && typeof udf.value === 'string' && udf.value.trim().length > 0;
                    if (groupsOn && udfOn) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"UDFItemAccessPrefix"']) || findLineWith(parsed, ['"ImportClearanceGroups"']) || 1,
                            message: 'ImportClearanceGroups=true AND UDFItemAccessPrefix="' + (udf.value) + '" — group-based import and UDF-driven item access are usually one-or-the-other.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.clearance-prefix.required',
                title: 'ImportByClearance is on but ImportClearancePrefix is empty',
                severity: 'error',
                hint: 'Set ImportClearancePrefix to the prefix used in CCURE clearance names (e.g. "Traka_").',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const byClearance = jsonFindKeyDeep(parsed.tree, 'ImportByClearance');
                    if (!byClearance || byClearance.value !== true) return [];
                    const prefix = jsonFindKeyDeep(parsed.tree, 'ImportClearancePrefix');
                    const ok = prefix && typeof prefix.value === 'string' && prefix.value.trim().length > 0;
                    if (ok) return [];
                    return [makeFinding(this, 'ccure', {
                        line: findLineWith(parsed, ['"ImportClearancePrefix"']) || findLineWith(parsed, ['"ImportByClearance"']) || 1
                    })];
                }
            },
            {
                id: 'ccure.card-id-format.invalid',
                title: 'TrakaCardIdFormat does not contain a {0} placeholder',
                severity: 'warning',
                hint: 'TrakaCardIdFormat must include at least {0} (Card Number). e.g. "{0:D5}" or "{2:X3}{0:D6}{1:D1}".',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const fmt = jsonFindKeyDeep(parsed.tree, 'TrakaCardIdFormat');
                    if (!fmt || typeof fmt.value !== 'string') return [];
                    if (!/\{0[:}]/.test(fmt.value)) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"TrakaCardIdFormat"']) || 1,
                            message: 'TrakaCardIdFormat="' + fmt.value + '" — missing {0} (Card Number) placeholder.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.scheduled-sync-time.format',
                title: 'ScheduledSyncTime is not in HH:mm 24h format',
                severity: 'warning',
                hint: 'Use 24-hour format with leading zeros, e.g. "02:00".',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const t = jsonFindKeyDeep(parsed.tree, 'ScheduledSyncTime');
                    if (!t || typeof t.value !== 'string' || !t.value.length) return [];
                    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.value)) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"ScheduledSyncTime"']) || 1,
                            message: 'ScheduledSyncTime="' + t.value + '" — expected HH:mm.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.no-sync-trigger',
                title: 'No sync trigger is enabled',
                severity: 'warning',
                hint: 'At least one of EnableRealtimeSync, EnableScheduledSync, or PerformFullSyncOnStart should be true.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const a = jsonFindKeyDeep(parsed.tree, 'EnableRealtimeSync');
                    const b = jsonFindKeyDeep(parsed.tree, 'EnableScheduledSync');
                    const c = jsonFindKeyDeep(parsed.tree, 'PerformFullSyncOnStart');
                    const any = (a && a.value === true) || (b && b.value === true) || (c && c.value === true);
                    if (any) return [];
                    if (!a && !b && !c) return [];
                    return [makeFinding(this, 'ccure', {
                        line: findLineWith(parsed, ['"EnableRealtimeSync"']) || 1
                    })];
                }
            },
            {
                id: 'ccure.orphan-check.unknown-enum',
                title: 'OrphanCheck has an unexpected value',
                severity: 'warning',
                hint: 'Allowed values are DoNothing, Inactivate, DeleteUser (or 0/1/2). Source: Configuration/DeleteUserOption.cs.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const o = jsonFindKeyDeep(parsed.tree, 'OrphanCheck');
                    if (!o) return [];
                    const v = o.value;
                    const known = ['DoNothing', 'Inactivate', 'DeleteUser', 0, 1, 2, '0', '1', '2'];
                    if (known.indexOf(v) === -1) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"OrphanCheck"']) || 1,
                            message: 'OrphanCheck="' + v + '" is not a recognised DeleteUserOption value.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.web-service-endpoint.shape',
                title: 'TrakaEndpoint URL looks malformed',
                severity: 'error',
                hint: 'Expected something like https://server:10700/Traka/.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const ep = jsonFindKeyDeep(parsed.tree, 'TrakaEndpoint');
                    if (!ep || typeof ep.value !== 'string' || !ep.value.length) return [];
                    if (!/^https?:\/\/[^/]+(:\d+)?\/[^\s]*/i.test(ep.value)) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"TrakaEndpoint"']) || 1,
                            message: 'TrakaEndpoint="' + ep.value + '" — expected scheme://host:port/path.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.web-service-endpoint.insecure',
                title: 'TrakaEndpoint uses plain HTTP',
                severity: 'warning',
                hint: 'Production deployments should use HTTPS. Plain HTTP exposes credentials sent on every WCF call.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const ep = jsonFindKeyDeep(parsed.tree, 'TrakaEndpoint');
                    if (!ep || typeof ep.value !== 'string') return [];
                    if (/^http:\/\//i.test(ep.value)) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"TrakaEndpoint"']) || 1,
                            message: 'TrakaEndpoint="' + ep.value + '" is HTTP, not HTTPS.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.full-sync-interval.zero',
                title: 'FullSyncInterval is 0',
                severity: 'warning',
                hint: 'IntegrationService.cs short-circuits the scheduled sync when FullSyncInterval is 0. If you also have EnableRealtimeSync=false, the integration will never sync.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'FullSyncInterval');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value === 0) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"FullSyncInterval"']) || 1,
                            message: 'FullSyncInterval=0 disables the scheduled sync.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.full-sync-interval.too-low',
                title: 'FullSyncInterval is suspiciously low',
                severity: 'warning',
                hint: 'FullSyncInterval is in seconds. Less than 60s will hammer CCURE and is almost never intentional. Default is 86400 (1 day).',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'FullSyncInterval');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value > 0 && v.value < 60) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"FullSyncInterval"']) || 1,
                            message: 'FullSyncInterval=' + v.value + 's — that is less than one minute between full syncs.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.full-sync-interval.too-high',
                title: 'FullSyncInterval is longer than a week',
                severity: 'info',
                hint: 'Default is 86400 (1 day). Values over 604800 (1 week) mean orphan / new users may take a long time to sync if realtime is also off.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'FullSyncInterval');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value > 604800) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"FullSyncInterval"']) || 1,
                            message: 'FullSyncInterval=' + v.value + 's (' + Math.round(v.value / 86400) + ' days).'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.personnel-aggregation-wait.range',
                title: 'DefaultPersonnelAggregationWait is outside the sane range',
                severity: 'warning',
                hint: 'Default is 2 (seconds). Values <1 will rapid-fire CCURE on every property change; values >300 (5 min) delay user changes too long.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'DefaultPersonnelAggregationWait');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value < 1 || v.value > 300) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"DefaultPersonnelAggregationWait"']) || 1,
                            message: 'DefaultPersonnelAggregationWait=' + v.value + 's — expected 1-300.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.max-log-size.range',
                title: 'MaxLogSizeMb is outside the sane range',
                severity: 'warning',
                hint: 'Default is 10 MB. Values <1 produce churn; values >2000 mean a single log file fills disk fast.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'MaxLogSizeMb');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value < 1 || v.value > 2000) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"MaxLogSizeMb"']) || 1,
                            message: 'MaxLogSizeMb=' + v.value + ' — expected 1-2000.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.max-log-files.range',
                title: 'MaxLogFiles is outside the sane range',
                severity: 'warning',
                hint: 'Default is 50. Values <1 mean no rotation; values >1000 fill disks unnecessarily.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'MaxLogFiles');
                    if (!v || typeof v.value !== 'number') return [];
                    if (v.value < 1 || v.value > 1000) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"MaxLogFiles"']) || 1,
                            message: 'MaxLogFiles=' + v.value + ' — expected 1-1000.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.user-field-mapping.format',
                title: 'UserFieldMapping entry is not in "Source,Destination" format',
                severity: 'warning',
                hint: 'CcureManager.cs and Mapping/UserMapping.cs both split on "," and expect exactly two fields: [Source],[Destination]. Any entry without a comma is silently skipped (with a "Incorrect mapping" log warning).',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'UserFieldMapping');
                    if (!v || !Array.isArray(v.value)) return [];
                    const out = [];
                    v.value.forEach((entry, idx) => {
                        if (typeof entry !== 'string') return;
                        const parts = entry.split(',');
                        if (parts.length !== 2 || !parts[0].trim().length || !parts[1].trim().length) {
                            out.push(makeFinding(this, 'ccure', {
                                line: findLineWith(parsed, [JSON.stringify(entry)]) || findLineWith(parsed, ['"UserFieldMapping"']) || 1,
                                message: 'UserFieldMapping[' + idx + ']="' + entry + '" — expected exactly "Source,Destination".'
                            }));
                        }
                    });
                    return out;
                }
            },
            {
                id: 'ccure.access-control.dead-config',
                title: 'iFob access-control rules are configured but IntegrateAccessControl is false',
                severity: 'info',
                hint: 'When IntegrateAccessControl=false, the rule-set fields (RemoveAnyiFob, ReplaceAnyiFob, RemoveSystemiFob, ReplaceSystemiFob, RemoveSpecificiFob, ReplaceSpecificiFob) are ignored. Either turn IntegrateAccessControl on or remove the dead config.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const ac = jsonFindKeyDeep(parsed.tree, 'IntegrateAccessControl');
                    if (!ac || ac.value !== false) return [];
                    const lists = ['RemoveAnyiFob', 'ReplaceAnyiFob', 'RemoveSystemiFob', 'ReplaceSystemiFob', 'RemoveSpecificiFob', 'ReplaceSpecificiFob'];
                    const populated = lists.filter(name => {
                        const v = jsonFindKeyDeep(parsed.tree, name);
                        return v && Array.isArray(v.value) && v.value.length > 0;
                    });
                    if (!populated.length) return [];
                    return [makeFinding(this, 'ccure', {
                        line: findLineWith(parsed, ['"' + populated[0] + '"']) || findLineWith(parsed, ['"IntegrateAccessControl"']) || 1,
                        message: 'IntegrateAccessControl=false but ' + populated.join(', ') + ' contain entries.'
                    })];
                }
            },
            {
                id: 'ccure.import-clearance-prefix.too-short',
                title: 'ImportClearancePrefix is suspiciously short',
                severity: 'info',
                hint: 'A 1-character prefix (e.g. "T") will match almost every clearance in CCURE and over-import. The default is "Traka_".',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'ImportClearancePrefix');
                    if (!v || typeof v.value !== 'string') return [];
                    const trimmed = v.value.trim();
                    if (trimmed.length === 1) {
                        return [makeFinding(this, 'ccure', {
                            line: findLineWith(parsed, ['"ImportClearancePrefix"']) || 1,
                            message: 'ImportClearancePrefix="' + trimmed + '" — single-character prefixes match too many clearances.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'ccure.test-user-count.production',
                title: 'TestUserCount is set in this config',
                severity: 'info',
                hint: 'TestUserCount is gated behind a #if DEBUG in IntegrationSettings.cs. A non-zero value here only matters in debug builds and should not be present in production configs.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'TestUserCount');
                    if (!v || typeof v.value !== 'number' || v.value === 0) return [];
                    return [makeFinding(this, 'ccure', {
                        line: findLineWith(parsed, ['"TestUserCount"']) || 1,
                        message: 'TestUserCount=' + v.value + ' — only used in DEBUG builds.'
                    })];
                }
            }
        ]
    });

    // ---- OnGuard ------------------------------------------------------------
    RULE_REGISTRY.push({
        product: 'onguard',
        productLabel: 'Lenel OnGuard integration',
        defaultEnabled: true,
        rules: [
            {
                id: 'onguard.directory-name.literal-internal',
                title: 'DirectoryName is set to literal "<Internal>"',
                severity: 'error',
                hint: 'Use the directory ID (e.g. "id-1") or the actual directory name as it appears in OnGuard. The literal string "<Internal>" is treated as a directory name to look up and the lookup will fail.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonAtPath(parsed.tree, 'Options.OnGuard.DirectoryName');
                    if (typeof v === 'string' && v.trim() === '<Internal>') {
                        return [makeFinding(this, 'onguard', {
                            line: findLineWith(parsed, ['"DirectoryName"']) || 1,
                            valuePath: 'Options.OnGuard.DirectoryName',
                            message: 'DirectoryName="<Internal>" — this literal value will fail directory lookup against OnGuard.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.base-url.trailing-slash',
                title: 'BaseUrl ends with a "/"',
                severity: 'warning',
                hint: 'Drop the trailing "/" — combined with internal paths it produces a double-slash (e.g. //eventbridge/signalr/) and SignalR connections fail.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'BaseUrl');
                    if (!v || typeof v.value !== 'string') return [];
                    if (v.value.endsWith('/')) {
                        return [makeFinding(this, 'onguard', {
                            line: findLineWith(parsed, ['"BaseUrl"']) || 1,
                            message: 'BaseUrl="' + v.value + '" ends with "/".'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.required-fields.missing',
                title: 'Username, Password, or BaseUrl is missing/empty',
                severity: 'error',
                hint: 'OnGuard authentication will fail without these.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const out = [];
                    for (const f of ['BaseUrl', 'Username', 'Password']) {
                        const v = jsonFindKeyDeep(parsed.tree, f);
                        const empty = !v || v.value == null || (typeof v.value === 'string' && !v.value.length);
                        if (empty) {
                            out.push(makeFinding(this, 'onguard', {
                                line: findLineWith(parsed, ['"' + f + '"']) || 1,
                                message: f + ' is missing or empty.'
                            }));
                        }
                    }
                    return out;
                }
            },
            {
                id: 'onguard.legacy-region-assignment.field',
                title: 'Legacy "RegionAssignment" field is set',
                severity: 'warning',
                hint: 'The v4.0 integration uses RegionAssignmentType. The numeric RegionAssignment field belongs to the old v3.6 OnGuardService.cfg format.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const legacy = jsonFindKeyDeep(parsed.tree, 'RegionAssignment');
                    const modern = jsonFindKeyDeep(parsed.tree, 'RegionAssignmentType');
                    if (legacy && !modern) {
                        return [makeFinding(this, 'onguard', {
                            line: findLineWith(parsed, ['"RegionAssignment"']) || 1
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.legacy-config.present',
                title: 'Legacy v3.6 OnGuardService.cfg is loaded',
                severity: 'warning',
                hint: 'After upgrading to v4.0, remove or archive OnGuardService.cfg — it is unused and can confuse troubleshooting.',
                check(parsed, ctx) {
                    // ctx.fileName lets us identify the legacy file specifically.
                    const fn = (ctx && ctx.fileName) || '';
                    if (/onguardservice\.cfg$/i.test(fn)) {
                        return [makeFinding(this, 'onguard', {
                            line: 1,
                            message: 'This file (' + fn + ') is the legacy v3.6 OnGuard config.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.dual-config.present',
                title: 'Both new and legacy OnGuard configs are loaded in this session',
                severity: 'info',
                hint: 'Only the new Traka.Integration.OnGuard.cfg is read by v4.0; the legacy file should be removed from the server.',
                check(parsed, ctx) {
                    if (!ctx || !Array.isArray(ctx.allConfigFileNames)) return [];
                    const names = ctx.allConfigFileNames;
                    const hasNew = names.some(n => /traka\.integration\.onguard.*\.cfg$/i.test(n));
                    const hasOld = names.some(n => /(^|[\\/])onguardservice\.cfg$/i.test(n));
                    if (hasNew && hasOld) {
                        return [makeFinding(this, 'onguard', {
                            line: 1,
                            message: 'Session has both Traka.Integration.OnGuard.cfg and OnGuardService.cfg.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.base-url.insecure',
                title: 'BaseUrl uses plain HTTP',
                severity: 'warning',
                hint: 'OnGuard OpenAccess credentials are sent on every API call. Production deployments should use HTTPS.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const v = jsonFindKeyDeep(parsed.tree, 'BaseUrl');
                    if (!v || typeof v.value !== 'string') return [];
                    if (/^http:\/\//i.test(v.value)) {
                        return [makeFinding(this, 'onguard', {
                            line: findLineWith(parsed, ['"BaseUrl"']) || 1,
                            message: 'BaseUrl="' + v.value + '" is HTTP, not HTTPS.'
                        })];
                    }
                    return [];
                }
            },
            {
                id: 'onguard.access-control.dead-config',
                title: 'iFob access-control rules are configured but IntegrateAccessControl is false',
                severity: 'info',
                hint: 'When IntegrateAccessControl=false, the iFob rule-set lists are ignored. Either turn IntegrateAccessControl on or remove the dead config.',
                check(parsed) {
                    if (parsed.format !== 'json') return [];
                    const ac = jsonFindKeyDeep(parsed.tree, 'IntegrateAccessControl');
                    if (!ac || ac.value !== false) return [];
                    const lists = ['RemoveAnyiFob', 'ReplaceAnyiFob', 'RemoveSystemiFob', 'ReplaceSystemiFob', 'RemoveSpecificiFob', 'ReplaceSpecificiFob'];
                    const populated = lists.filter(name => {
                        const v = jsonFindKeyDeep(parsed.tree, name);
                        return v && Array.isArray(v.value) && v.value.length > 0;
                    });
                    if (!populated.length) return [];
                    return [makeFinding(this, 'onguard', {
                        line: findLineWith(parsed, ['"' + populated[0] + '"']) || findLineWith(parsed, ['"IntegrateAccessControl"']) || 1,
                        message: 'IntegrateAccessControl=false but ' + populated.join(', ') + ' contain entries.'
                    })];
                }
            }
        ]
    });

    // ---- Postbox (placeholder) ---------------------------------------------
    RULE_REGISTRY.push({
        product: 'postbox',
        productLabel: 'Traka Postbox integration (placeholder)',
        defaultEnabled: false,
        rules: [
            {
                id: 'postbox.placeholder',
                title: 'Postbox rule pack is a placeholder',
                severity: 'info',
                hint: 'Drop in real Postbox validation rules here once a sample config is available. See js/config-rules.js — RULE_REGISTRY entry for product:"postbox".',
                check() { return []; } // Intentionally never fires.
            }
        ]
    });

    // ---- Generic XML / JSON fallbacks --------------------------------------
    RULE_REGISTRY.push({
        product: 'generic_xml',
        productLabel: 'Generic XML config',
        defaultEnabled: true,
        rules: [
            {
                id: 'generic_xml.parse-error',
                title: 'XML parse error',
                severity: 'error',
                check(parsed) {
                    if (parsed.format === 'xml') return [];
                    if (parsed.parseError && parsed.parseError.startsWith('XML parse error')) {
                        return [makeFinding(this, 'generic_xml', { line: 1, message: parsed.parseError })];
                    }
                    return [];
                }
            }
        ]
    });

    RULE_REGISTRY.push({
        product: 'generic_json',
        productLabel: 'Generic JSON config',
        defaultEnabled: true,
        rules: [
            {
                id: 'generic_json.parse-error',
                title: 'JSON parse error',
                severity: 'error',
                check(parsed) {
                    if (parsed.format === 'json') return [];
                    if (parsed.parseError && parsed.parseError.startsWith('JSON parse error')) {
                        return [makeFinding(this, 'generic_json', { line: 1, message: parsed.parseError })];
                    }
                    return [];
                }
            },
            {
                id: 'generic_json.bom',
                title: 'File starts with a UTF-8 BOM',
                severity: 'info',
                hint: 'A BOM at the start of a JSON file can cause some parsers to fail. Save the file as UTF-8 without BOM.',
                check(parsed) {
                    if (parsed.raw && parsed.raw.charCodeAt(0) === 0xFEFF) {
                        return [makeFinding(this, 'generic_json', { line: 1 })];
                    }
                    return [];
                }
            }
        ]
    });

    // ========================================================================
    // Rule state (per-rule + per-product enable/disable, persisted)
    // ========================================================================
    const STATE_KEY = 'traka-config-rules-state';
    let _state = null;

    function defaultRuleState() {
        const out = { products: {}, rules: {} };
        for (const pack of RULE_REGISTRY) {
            out.products[pack.product] = { enabled: pack.defaultEnabled !== false };
            for (const rule of pack.rules) {
                out.rules[rule.id] = { enabled: true };
            }
        }
        return out;
    }

    function loadConfigRulesState() {
        try {
            const saved = localStorage.getItem(STATE_KEY);
            if (!saved) {
                _state = defaultRuleState();
                return _state;
            }
            const parsed = JSON.parse(saved);
            const merged = defaultRuleState();
            // Merge in saved values, keeping defaults for anything new.
            if (parsed.products) {
                for (const k of Object.keys(parsed.products)) {
                    if (merged.products[k]) merged.products[k] = Object.assign({}, merged.products[k], parsed.products[k]);
                }
            }
            if (parsed.rules) {
                for (const k of Object.keys(parsed.rules)) {
                    if (merged.rules[k]) merged.rules[k] = Object.assign({}, merged.rules[k], parsed.rules[k]);
                }
            }
            _state = merged;
            return _state;
        } catch (e) {
            console.error('Failed to load config rules state:', e);
            _state = defaultRuleState();
            return _state;
        }
    }

    function saveConfigRulesState() {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(_state || defaultRuleState()));
        } catch (e) {
            console.error('Failed to save config rules state:', e);
        }
    }

    function getRuleState() {
        if (!_state) loadConfigRulesState();
        return _state;
    }

    function setProductEnabled(productId, enabled) {
        const s = getRuleState();
        if (!s.products[productId]) s.products[productId] = { enabled: !!enabled };
        else s.products[productId].enabled = !!enabled;
        saveConfigRulesState();
    }

    function setRuleEnabled(ruleId, enabled) {
        const s = getRuleState();
        if (!s.rules[ruleId]) s.rules[ruleId] = { enabled: !!enabled };
        else s.rules[ruleId].enabled = !!enabled;
        saveConfigRulesState();
    }

    function isProductEnabled(productId) {
        const s = getRuleState();
        return s.products[productId] ? s.products[productId].enabled !== false : true;
    }
    function isRuleEnabled(ruleId) {
        const s = getRuleState();
        return s.rules[ruleId] ? s.rules[ruleId].enabled !== false : true;
    }

    // ========================================================================
    // Runner
    // ========================================================================
    /**
     * Run all enabled rules for the detected product (and the cross-cutting
     * "generic" packs if the product itself didn't parse).
     * @param {{ name: string }} fileData
     * @param {ParsedConfig} parsed
     * @param {string} productId
     * @param {{ allConfigFileNames?: string[] }} ctx
     * @returns {ConfigFinding[]}
     */
    function runConfigRules(fileData, parsed, productId, ctx) {
        return runConfigRulesWithMeta(fileData, parsed, productId, ctx).findings;
    }

    /**
     * Same as runConfigRules but also returns metadata: which rules were
     * considered (id + title + product), which were skipped because the
     * product/rule was disabled, and which threw. Lets the UI show
     * "Checked X rules" / "Show what was checked" details.
     */
    function runConfigRulesWithMeta(fileData, parsed, productId, ctx) {
        const findings = [];
        const considered = []; // { ruleId, title, productId, severity, fired, skipped, error }
        const fileName = fileData && fileData.name ? fileData.name : '';
        const checkCtx = Object.assign({ fileName: fileName }, ctx || {});

        // Always run the generic packs as a safety net.
        const packsToRun = RULE_REGISTRY.filter(p => p.product === productId || p.product === 'generic_xml' || p.product === 'generic_json');

        for (const pack of packsToRun) {
            const productEnabled = isProductEnabled(pack.product);
            for (const rule of pack.rules) {
                const ruleEnabled = isRuleEnabled(rule.id);
                const meta = {
                    ruleId: rule.id,
                    title: rule.title,
                    productId: pack.product,
                    productLabel: pack.productLabel,
                    severity: rule.severity || 'warning',
                    fired: false,
                    skipped: !productEnabled || !ruleEnabled,
                    skipReason: !productEnabled ? 'product disabled' : (!ruleEnabled ? 'rule disabled' : ''),
                    error: null
                };
                if (!meta.skipped) {
                    try {
                        const out = rule.check.call(rule, parsed, checkCtx) || [];
                        if (out.length > 0) meta.fired = true;
                        for (const f of out) findings.push(f);
                    } catch (e) {
                        console.error('Config rule "' + rule.id + '" threw:', e);
                        meta.error = String(e && e.message || e);
                    }
                }
                considered.push(meta);
            }
        }
        return { findings: findings, considered: considered };
    }

    /**
     * Top-level helper: detect, parse, run. Returns
     * { productId, parsed, findings, rulesConsidered } so callers can render
     * both the failures and a confirmation that rules ran when there are none.
     */
    function analyzeConfigFile(fileData, ctx) {
        const raw = fileData && fileData.content != null
            ? fileData.content
            : (fileData && fileData.lines ? fileData.lines.join('\n') : '');
        const detection = detectConfigProduct(fileData ? fileData.name || '' : '', raw);
        const parsed = parseConfigDocument(detection.productId, raw);
        const meta = runConfigRulesWithMeta(fileData, parsed, detection.productId, ctx);
        return {
            productId: detection.productId,
            productConfidence: detection.confidence,
            productReasons: detection.reasons,
            parsed: parsed,
            findings: meta.findings,
            rulesConsidered: meta.considered
        };
    }

    // ========================================================================
    // Public surface
    // ========================================================================
    window.TrakaConfigRules = {
        detectConfigProduct: detectConfigProduct,
        parseConfigDocument: parseConfigDocument,
        runConfigRules: runConfigRules,
        runConfigRulesWithMeta: runConfigRulesWithMeta,
        analyzeConfigFile: analyzeConfigFile,
        loadConfigRulesState: loadConfigRulesState,
        saveConfigRulesState: saveConfigRulesState,
        getRuleState: getRuleState,
        setProductEnabled: setProductEnabled,
        setRuleEnabled: setRuleEnabled,
        isProductEnabled: isProductEnabled,
        isRuleEnabled: isRuleEnabled,
        get RULE_REGISTRY() { return RULE_REGISTRY; }
    };
})();
