/**
 * Quick Node smoke-test for js/config-rules.js. Stubs window + DOMParser,
 * loads the IIFE, then exercises detection / parsing / rules against
 * synthetic Traka product configs. Intentionally not a full unit test rig —
 * it just ensures rules don't throw and produce expected hits.
 *
 * Run from the TrakaLogAnalyzer-WebPoC folder:
 *   npm install --no-save @xmldom/xmldom
 *   node test_config_rules.js
 */
'use strict';

// Stub window/DOMParser before loading the module.
const win = {};
global.window = win;
try {
    const { DOMParser } = require('@xmldom/xmldom');
    global.DOMParser = DOMParser;
} catch (e) {
    console.warn('[smoketest] @xmldom/xmldom not installed — XML rule tests will be skipped');
}
global.localStorage = {
    _data: Object.create(null),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
};

// Load the script.
require('./js/config-rules.js');
const TCR = win.TrakaConfigRules;
if (!TCR) {
    console.error('TrakaConfigRules namespace did not load.');
    process.exit(1);
}

let pass = 0, fail = 0;
function ok(label) { pass++; console.log('  PASS  ' + label); }
function bad(label, extra) { fail++; console.log('  FAIL  ' + label + (extra ? ' :: ' + extra : '')); }
function expect(cond, label, extra) { cond ? ok(label) : bad(label, extra); }

console.log('\n# Detection');
let det = TCR.detectConfigProduct('Traka.Integration.OnGuard.cfg', '{"Options":{"OnGuard":{"DirectoryName":"<Internal>"}}}');
expect(det.productId === 'onguard', 'OnGuard cfg detected', JSON.stringify(det));

det = TCR.detectConfigProduct('Traka.Integration.CCURE9000.Service.cfg', '{"TrakaCardIdFormat":"{0:D5}","ImportClearancePrefix":"Traka_"}');
expect(det.productId === 'ccure', 'CCURE cfg detected', JSON.stringify(det));

det = TCR.detectConfigProduct('Traka.Integration.Service.exe.config', '<configuration><appSettings><add key="ApplicationName" value="IE"/></appSettings></configuration>');
expect(det.productId === 'ie_service' || det.productId === 'ie_monitor', 'IE config detected (filename leans service)', JSON.stringify(det));

det = TCR.detectConfigProduct('random.cfg', '{}');
expect(det.productId === 'generic_json', 'Generic JSON fallback for unknown', JSON.stringify(det));

console.log('\n# OnGuard rules');
{
    const raw = JSON.stringify({
        Options: { OnGuard: {
            DirectoryName: '<Internal>',
            BaseUrl: 'https://server:8080/api/access/onguard/openaccess/',
            Username: '',
            Password: ''
        }}
    });
    const result = TCR.analyzeConfigFile({ name: 'Traka.Integration.OnGuard.cfg', content: raw }, { allConfigFileNames: ['Traka.Integration.OnGuard.cfg', 'OnGuardService.cfg'] });
    const ids = result.findings.map(f => f.ruleId);
    expect(ids.includes('onguard.directory-name.literal-internal'), 'DirectoryName literal <Internal> flagged', ids.join(','));
    expect(ids.includes('onguard.base-url.trailing-slash'), 'BaseUrl trailing slash flagged', ids.join(','));
    expect(ids.includes('onguard.required-fields.missing'), 'Missing Username/Password flagged', ids.join(','));
    expect(ids.includes('onguard.dual-config.present'), 'Dual config (new + legacy) flagged', ids.join(','));
}

console.log('\n# CCURE rules');
{
    const raw = JSON.stringify({
        ImportAll: true,
        ImportByClearance: true,
        ImportSelectedUsers: false,
        ImportClearanceGroups: true,
        UDFItemAccessPrefix: 'TACL',
        ImportClearancePrefix: '',
        TrakaCardIdFormat: '{1:D4}',  // missing {0}
        ScheduledSyncTime: '2:00',     // wrong format (no leading zero)
        EnableRealtimeSync: false,
        EnableScheduledSync: false,
        PerformFullSyncOnStart: false,
        OrphanCheck: 'WhoKnows',
        TrakaEndpoint: 'not-a-url'
    });
    const result = TCR.analyzeConfigFile({ name: 'Traka.Integration.CCURE9000.Service.cfg', content: raw }, {});
    const ids = result.findings.map(f => f.ruleId);
    expect(ids.includes('ccure.import-mode.mutually-exclusive'), 'Multiple import modes flagged', ids.join(','));
    expect(ids.includes('ccure.groups-vs-udf.conflict'), 'Groups vs UDF conflict flagged', ids.join(','));
    expect(ids.includes('ccure.clearance-prefix.required'), 'Empty ImportClearancePrefix flagged when ImportByClearance', ids.join(','));
    expect(ids.includes('ccure.card-id-format.invalid'), 'TrakaCardIdFormat without {0} flagged', ids.join(','));
    expect(ids.includes('ccure.scheduled-sync-time.format'), 'ScheduledSyncTime bad format flagged', ids.join(','));
    expect(ids.includes('ccure.no-sync-trigger'), 'No sync trigger flagged', ids.join(','));
    expect(ids.includes('ccure.orphan-check.unknown-enum'), 'OrphanCheck enum mismatch flagged', ids.join(','));
    expect(ids.includes('ccure.web-service-endpoint.shape'), 'Bad TrakaEndpoint flagged', ids.join(','));
}

console.log('\n# CCURE rules (richer set)');
{
    const raw = JSON.stringify({
        TrakaEndpoint: 'http://server:10700/Traka/',  // insecure http
        FullSyncInterval: 30,                          // too low (<60)
        DefaultPersonnelAggregationWait: 0,            // too low (<1)
        MaxLogSizeMb: 5000,                            // too high (>2000)
        MaxLogFiles: 5000,                             // too high (>1000)
        IntegrateAccessControl: false,
        RemoveAnyiFob: ['1-5'],                        // dead config
        UserFieldMapping: ['FirstName,Forename', 'BadEntry-No-Comma', 'OK,Two,ExtraComma'],
        ImportClearancePrefix: 'T',                    // too short
        ImportByClearance: false,
        TestUserCount: 100,                            // production warning
        TrakaCardIdFormat: '{0:D5}',
        ScheduledSyncTime: '02:00',
        EnableRealtimeSync: true,
        OrphanCheck: 'DoNothing'
    });
    const result = TCR.analyzeConfigFile({ name: 'Traka.Integration.CCURE9000.Service.cfg', content: raw }, {});
    const ids = result.findings.map(f => f.ruleId);
    expect(ids.includes('ccure.web-service-endpoint.insecure'), 'CCURE: HTTP TrakaEndpoint flagged', ids.join(','));
    expect(ids.includes('ccure.full-sync-interval.too-low'), 'CCURE: FullSyncInterval < 60s flagged', ids.join(','));
    expect(ids.includes('ccure.personnel-aggregation-wait.range'), 'CCURE: aggregation-wait out of range flagged', ids.join(','));
    expect(ids.includes('ccure.max-log-size.range'), 'CCURE: MaxLogSizeMb out of range flagged', ids.join(','));
    expect(ids.includes('ccure.max-log-files.range'), 'CCURE: MaxLogFiles out of range flagged', ids.join(','));
    expect(ids.includes('ccure.access-control.dead-config'), 'CCURE: dead access-control config flagged', ids.join(','));
    expect(ids.includes('ccure.user-field-mapping.format'), 'CCURE: bad UserFieldMapping entries flagged', ids.join(','));
    expect(ids.includes('ccure.import-clearance-prefix.too-short'), 'CCURE: 1-char prefix flagged', ids.join(','));
    expect(ids.includes('ccure.test-user-count.production'), 'CCURE: TestUserCount in prod flagged', ids.join(','));
}

console.log('\n# Healthy CCURE config (panel meta)');
{
    const raw = JSON.stringify({
        TrakaEndpoint: 'https://server:10700/Traka/',
        TrakaUsername: 'admin',
        TrakaPassword: '***',
        FullSyncInterval: 86400,
        ImportAll: true,
        ImportByClearance: false,
        ImportSelectedUsers: false,
        EnableRealtimeSync: true,
        EnableScheduledSync: false,
        ScheduledSyncTime: '02:00',
        OrphanCheck: 'DoNothing',
        TrakaCardIdFormat: '{0:D5}',
        DefaultPersonnelAggregationWait: 2,
        MaxLogSizeMb: 10,
        MaxLogFiles: 50,
        UserFieldMapping: ['FirstName,Forename', 'LastName,Surname'],
        IntegrateAccessControl: true,
        RemoveAnyiFob: []
    });
    const result = TCR.analyzeConfigFile({ name: 'Traka.Integration.CCURE9000.Service.cfg', content: raw }, {});
    expect(result.findings.length === 0, 'Healthy CCURE: no findings', JSON.stringify(result.findings.map(f => f.ruleId)));
    expect(Array.isArray(result.rulesConsidered) && result.rulesConsidered.length > 0, 'Healthy CCURE: rulesConsidered populated', String(result.rulesConsidered && result.rulesConsidered.length));
    expect(result.productId === 'ccure', 'Healthy CCURE: productId === ccure', result.productId);
}

if (global.DOMParser) {
    console.log('\n# IE Service XML rules');
    // Synthetic minimal IE Service config that violates several rules at once.
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="ApplicationName" value="WRONG"/>
  </appSettings>
  <startup>
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.1"/>
  </startup>
  <system.serviceModel>
    <client>
      <endpoint address="https://server-a:10501/Admin" binding="wsHttpBinding" contract="BusinessEngine.IAdminService" name="WSHttpBinding_IAdminService"/>
      <endpoint address="https://server-b:10501/Comms" binding="wsHttpBinding" contract="BusinessEngine.ICommsService" name="WSHttpBinding_ICommsService"/>
    </client>
  </system.serviceModel>
</configuration>`;
    const result = TCR.analyzeConfigFile({ name: 'Traka.Integration.Service.exe.config', content: xml }, {});
    const ids = result.findings.map(f => f.ruleId);
    expect(ids.includes('ie_service.application-name.missing'), 'IE Service: ApplicationName != "IE" flagged', ids.join(','));
    expect(ids.includes('ie_service.entity-framework-section.missing'), 'IE Service: missing entityFramework section flagged', ids.join(','));
    expect(ids.includes('ie_service.startup.runtime'), 'IE Service: wrong supportedRuntime sku flagged', ids.join(','));
    expect(ids.includes('ie_service.endpoints.host-mismatch'), 'IE Service: endpoint host mismatch flagged', ids.join(','));
    expect(ids.includes('ie_service.default-proxy-missing'), 'IE Service: missing defaultProxy flagged', ids.join(','));
    expect(ids.includes('ie_service.endpoint-scheme.insecure') || ids.length >= 5, 'IE Service: rules ran (richer set)', ids.join(','));

    // Insecure-scheme specific test.
    const insecureXml = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings><add key="ApplicationName" value="IE"/></appSettings>
  <configSections><section name="entityFramework" type="X"/></configSections>
  <startup><supportedRuntime sku=".NETFramework,Version=v4.8"/></startup>
  <system.net><defaultProxy enabled="false"/></system.net>
  <system.serviceModel>
    <client>
      <endpoint address="http://server:10501/Admin" contract="BusinessEngine.IAdminService"/>
    </client>
  </system.serviceModel>
</configuration>`;
    const insecure = TCR.analyzeConfigFile({ name: 'Traka.Integration.Service.exe.config', content: insecureXml }, {});
    const insecureIds = insecure.findings.map(f => f.ruleId);
    expect(insecureIds.includes('ie_service.endpoint-scheme.insecure'), 'IE Service: http endpoint flagged', insecureIds.join(','));
} else {
    console.log('  SKIP IE Service XML rules (no DOMParser available)');
}

console.log('\nResult: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
