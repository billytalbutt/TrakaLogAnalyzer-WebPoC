/* ============================================
   Traka Log Analyzer - Solution Database
   Error patterns with actionable solutions
   ============================================ */

const solutionDatabase = {
    patterns: [
        // ========================================
        // 1. Business Engine Configuration Errors
        // ========================================
        {
            id: 'BE_NOT_CURRENT',
            pattern: /No Business Engine is set|Business Engine with ID .* not found|Could not find a BusinessEngine id in the registry/i,
            severity: 'CRITICAL',
            title: 'Business Engine Not Set as Current',
            category: 'Configuration',
            estimatedTime: '5-10 minutes',
            why: 'The Business Engine configuration in the registry doesn\'t point to a valid engine record. This prevents the Business Engine service from starting properly.',
            steps: [
                {
                    number: 1,
                    title: 'Open TrakaWEB Admin',
                    description: 'Launch the Traka Admin desktop application installed on the server.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to Engines',
                    description: 'From the main menu, select "Engines" to view all configured engines.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Locate Business Engine',
                    description: 'Find the Business Engine record for this server in the engines list.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Set As Current',
                    description: 'Right-click on the Business Engine record and select "Set As Current" from the context menu.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Changes',
                    description: 'Click the Save button to persist the configuration changes.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Service',
                    description: 'Open Services (services.msc), locate "Traka Business Engine Service", and restart it.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Administrative access to the Traka server',
                'Traka Admin application installed',
                'Windows service restart permissions'
            ],
            relatedIssues: ['COMMS_ENGINE_CONNECTION', 'INTEGRATION_AUTH_FAIL']
        },
        {
            id: 'BE_REGISTRY_WRITE',
            pattern: /Unable to write EngineID to registry config/i,
            severity: 'HIGH',
            title: 'Registry Write Permission Denied',
            category: 'Configuration',
            estimatedTime: '5-10 minutes',
            why: 'The Business Engine service account doesn\'t have write permissions to the required registry keys.',
            steps: [
                {
                    number: 1,
                    title: 'Open Registry Editor',
                    description: 'Press Win+R, type "regedit", and press Enter.',
                    command: 'regedit'
                },
                {
                    number: 2,
                    title: 'Navigate to Traka Registry Key',
                    description: 'Go to HKLM:\\SOFTWARE\\Traka Limited\\Traka Web\\Business Engine',
                    command: null
                },
                {
                    number: 3,
                    title: 'Check Permissions',
                    description: 'Right-click on the "Business Engine" key and select "Permissions".',
                    command: null
                },
                {
                    number: 4,
                    title: 'Add Service Account',
                    description: 'Add the Business Engine service account and grant "Full Control" permissions.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Apply Changes',
                    description: 'Click OK to save permission changes.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Service',
                    description: 'Restart the Traka Business Engine Service to apply changes.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Administrative access to Windows server',
                'Knowledge of service account being used'
            ],
            relatedIssues: ['BE_NOT_CURRENT']
        },
        {
            id: 'BE_RESTART_REQUIRED',
            pattern: /This setting will only take effect when the Business Engine is restarted/i,
            severity: 'MEDIUM',
            title: 'Business Engine Restart Required',
            category: 'Configuration',
            estimatedTime: '2 minutes',
            why: 'Configuration changes have been made but won\'t take effect until the service is restarted.',
            steps: [
                {
                    number: 1,
                    title: 'Open Services',
                    description: 'Press Win+R, type "services.msc", and press Enter.',
                    command: 'services.msc'
                },
                {
                    number: 2,
                    title: 'Locate Service',
                    description: 'Find "Traka Business Engine Service" in the services list.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Restart Service',
                    description: 'Right-click the service and select "Restart". Wait for it to start successfully.',
                    command: null
                }
            ],
            prerequisites: [
                'Windows service management permissions'
            ],
            relatedIssues: []
        },

        // ========================================
        // 2. Certificate Errors
        // ========================================
        {
            id: 'CERT_NO_PRIVATE_KEY',
            pattern: /Service Certificate does NOT have a Private Key!/i,
            severity: 'CRITICAL',
            title: 'Certificate Missing Private Key',
            category: 'Security',
            estimatedTime: '15-20 minutes',
            why: 'The certificate installed doesn\'t include the private key, which is required for secure communications.',
            steps: [
                {
                    number: 1,
                    title: 'Obtain Complete Certificate',
                    description: 'Request or export a certificate WITH private key (must be .pfx or .p12 format, not .cer)',
                    command: null
                },
                {
                    number: 2,
                    title: 'Remove Existing Certificate',
                    description: 'Open Certificate Manager (certmgr.msc) and remove the incomplete certificate.',
                    command: 'certmgr.msc'
                },
                {
                    number: 3,
                    title: 'Import New Certificate',
                    description: 'Import the .pfx certificate to the Local Machine\\Personal store. Ensure "Mark this key as exportable" is checked.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Grant Private Key Access',
                    description: 'Right-click the certificate → All Tasks → Manage Private Keys. Add the service account with Read permissions.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Restart Service',
                    description: 'Restart the Traka Business Engine Service to load the new certificate.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Administrative access to certificate store',
                'Valid .pfx certificate file with private key',
                'Service account name'
            ],
            relatedIssues: ['CERT_NOT_LOADED']
        },
        {
            id: 'CERT_NOT_LOADED',
            pattern: /Service Certificate could not be loaded from the local machine store/i,
            severity: 'CRITICAL',
            title: 'Certificate Not Found in Store',
            category: 'Security',
            estimatedTime: '10-15 minutes',
            why: 'The certificate specified in configuration cannot be found in the certificate store.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Certificate Name',
                    description: 'Check the ServiceCertificateName value in the Traka configuration file.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Open Certificate Manager',
                    description: 'Press Win+R, type "certlm.msc" (not certmgr.msc) to open LOCAL MACHINE certificates.',
                    command: 'certlm.msc'
                },
                {
                    number: 3,
                    title: 'Check Personal Store',
                    description: 'Navigate to Certificates (Local Computer) → Personal → Certificates. Look for your certificate.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Import If Missing',
                    description: 'If not found, import the certificate: Right-click Personal → All Tasks → Import. Choose Local Machine as the store location.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Update Configuration',
                    description: 'Ensure the certificate Subject Name or Thumbprint in config matches exactly (case-sensitive).',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Service',
                    description: 'Restart the Traka Business Engine Service.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Certificate file (.pfx or .cer)',
                'Administrative access',
                'Access to Traka configuration files'
            ],
            relatedIssues: ['CERT_NO_PRIVATE_KEY', 'CERT_EXPIRING']
        },
        {
            id: 'CERT_EXPIRING',
            pattern: /Service Certificate will expire within 1 month|Certificate will expire|Certificate.*exp/i,
            severity: 'HIGH',
            title: 'Certificate Expiring Soon',
            category: 'Security',
            estimatedTime: '20-30 minutes',
            why: 'The SSL/TLS certificate is approaching its expiration date and needs to be renewed.',
            steps: [
                {
                    number: 1,
                    title: 'Check Expiry Date',
                    description: 'Open Certificate Manager (certlm.msc) and view the certificate expiration date.',
                    command: 'certlm.msc'
                },
                {
                    number: 2,
                    title: 'Request New Certificate',
                    description: 'Contact your certificate authority or IT team to obtain a renewed certificate.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Import New Certificate',
                    description: 'Import the new certificate to Local Machine\\Personal store.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Update Configuration',
                    description: 'Update the ServiceCertificateName or Thumbprint in Traka configuration to reference the new certificate.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Test Configuration',
                    description: 'Restart services and verify HTTPS connectivity is working.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Remove Old Certificate',
                    description: 'After confirming the new certificate works, remove the expired certificate.',
                    command: null
                }
            ],
            prerequisites: [
                'New certificate from CA',
                'Administrative access',
                'Scheduled maintenance window (recommended)'
            ],
            relatedIssues: []
        },

        // ========================================
        // 3. Database Connection Errors
        // ========================================
        {
            id: 'DB_CONNECTION_FAILED',
            pattern: /Database server connection failed|Cannot connect to server|Connection timeout|Server may be slow or unreachable/i,
            severity: 'CRITICAL',
            title: 'Database Connection Failed',
            category: 'Database',
            estimatedTime: '10-20 minutes',
            why: 'The application cannot establish a connection to the SQL Server database. This could be due to network issues, SQL Server being offline, firewall rules, or incorrect connection settings.',
            steps: [
                {
                    number: 1,
                    title: 'Verify SQL Server Status',
                    description: 'Open Services (services.msc) and confirm "SQL Server (MSSQLSERVER)" is running.',
                    command: 'services.msc'
                },
                {
                    number: 2,
                    title: 'Test Network Connectivity',
                    description: 'Open Command Prompt and ping the SQL Server: ping [server-name-or-ip]',
                    command: 'ping [SQL-SERVER]'
                },
                {
                    number: 3,
                    title: 'Test SQL Port',
                    description: 'Test if port 1433 is accessible: telnet [server] 1433 (or use Test-NetConnection in PowerShell)',
                    command: 'Test-NetConnection [SQL-SERVER] -Port 1433'
                },
                {
                    number: 4,
                    title: 'Check SQL Browser Service',
                    description: 'Ensure "SQL Server Browser" service is running (required for named instances).',
                    command: 'services.msc'
                },
                {
                    number: 5,
                    title: 'Verify Firewall Rules',
                    description: 'Check Windows Firewall allows inbound connections on port 1433 (SQL Server default port).',
                    command: 'wf.msc'
                },
                {
                    number: 6,
                    title: 'Review Connection String',
                    description: 'Check the Traka configuration file and verify server name, instance name, and authentication method are correct.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Test with SSMS',
                    description: 'Use SQL Server Management Studio to test connectivity with the same credentials.',
                    command: null
                },
                {
                    number: 8,
                    title: 'Restart Services',
                    description: 'After making changes, restart the Traka services.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to SQL Server',
                'SQL Server Management Studio (for testing)',
                'Network and firewall access',
                'Traka configuration file access'
            ],
            relatedIssues: ['DB_LOGIN_FAILED', 'DB_TIMEOUT']
        },
        {
            id: 'DB_LOGIN_FAILED',
            pattern: /Login failed|Please check your credentials|Authentication failed.*SQL/i,
            severity: 'CRITICAL',
            title: 'SQL Server Login Failed',
            category: 'Database',
            estimatedTime: '5-10 minutes',
            why: 'The SQL Server login credentials provided in the connection string are incorrect or the login doesn\'t have permission to access the server.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Credentials',
                    description: 'Check the connection string in the Traka configuration file for the correct username and password.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Check Authentication Mode',
                    description: 'Verify if SQL Server is in Windows Authentication or Mixed Mode. Open SSMS → Server Properties → Security.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Test Login in SSMS',
                    description: 'Try logging into SQL Server Management Studio with the same credentials to confirm they work.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Verify Login Exists',
                    description: 'In SSMS, expand Security → Logins and verify the user account exists.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Check Login is Enabled',
                    description: 'Right-click the login → Properties → Status. Ensure "Permission to connect" is Granted and "Login" is Enabled.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Update Configuration',
                    description: 'If credentials were wrong, update the connection string in the Traka configuration file.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Restart Service',
                    description: 'Restart the Traka service to apply the new connection string.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to SQL Server Management Studio',
                'SQL Server administrator access',
                'Traka configuration file access'
            ],
            relatedIssues: ['DB_CONNECTION_FAILED', 'DB_DENIED']
        },
        {
            id: 'DB_DENIED',
            pattern: /Cannot open database.*Check the database name|Database.*does not exist|Database access denied/i,
            severity: 'CRITICAL',
            title: 'Database Access Denied',
            category: 'Database',
            estimatedTime: '5-10 minutes',
            why: 'The login account doesn\'t have permission to access the specified database, or the database name is incorrect.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Database Name',
                    description: 'Check the connection string and ensure the database name is spelled correctly (case-sensitive).',
                    command: null
                },
                {
                    number: 2,
                    title: 'List Databases',
                    description: 'In SSMS, connect to SQL Server and expand Databases to see all available databases.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Check User Mapping',
                    description: 'In SSMS: Security → Logins → [YourLogin] → Properties → User Mapping. Ensure the database is checked.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Grant Database Access',
                    description: 'In the User Mapping tab, check the database and assign appropriate roles (typically db_datareader and db_datawriter).',
                    command: null
                },
                {
                    number: 5,
                    title: 'Apply Changes',
                    description: 'Click OK to save the permissions.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Service',
                    description: 'Restart the Traka service to reconnect with proper permissions.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'SQL Server administrator access',
                'Access to SSMS'
            ],
            relatedIssues: ['DB_LOGIN_FAILED']
        },
        {
            id: 'DB_PASSWORD_EMPTY',
            pattern: /Database password is empty!/i,
            severity: 'HIGH',
            title: 'Database Password Not Configured',
            category: 'Configuration',
            estimatedTime: '5 minutes',
            why: 'The database connection string has an empty password, which is likely causing authentication to fail.',
            steps: [
                {
                    number: 1,
                    title: 'Locate Configuration File',
                    description: 'Find the Traka configuration file (typically web.config or app.config).',
                    command: null
                },
                {
                    number: 2,
                    title: 'Find Connection String',
                    description: 'Locate the <connectionStrings> section and find the connection string.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Add Password',
                    description: 'Update the connection string to include the correct password: Password=[your-password];',
                    command: null
                },
                {
                    number: 4,
                    title: 'Save File',
                    description: 'Save the configuration file.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Restart Service/App Pool',
                    description: 'Restart the Traka service or IIS application pool to load the new configuration.',
                    command: 'iisreset'
                }
            ],
            prerequisites: [
                'SQL Server password',
                'Access to configuration files',
                'Service restart permissions'
            ],
            relatedIssues: ['DB_LOGIN_FAILED']
        },

        // ========================================
        // 4. Integration Engine Configuration
        // ========================================
        {
            id: 'IE_SSL_NOT_CONFIGURED',
            pattern: /SSL has not been configured.*unencrypted|SSL not configured/i,
            severity: 'HIGH',
            title: 'Integration Engine SSL Not Configured',
            category: 'Security',
            estimatedTime: '15-20 minutes',
            why: 'The Integration Engine is not configured to use SSL/TLS, meaning all data transmitted is sent in plain text.',
            steps: [
                {
                    number: 1,
                    title: 'Obtain SSL Certificate',
                    description: 'Ensure you have a valid SSL certificate installed in the Local Machine certificate store.',
                    command: 'certlm.msc'
                },
                {
                    number: 2,
                    title: 'Open Configuration',
                    description: 'Locate the Integration Engine configuration file (typically in C:\\ProgramData\\Traka\\).',
                    command: null
                },
                {
                    number: 3,
                    title: 'Enable SSL',
                    description: 'Set UseSSL=true in the configuration file.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Configure Certificate',
                    description: 'Add the certificate thumbprint or subject name to the configuration.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Update Port Binding',
                    description: 'Change the port from HTTP (8080) to HTTPS (8443) if needed.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Service',
                    description: 'Restart the "Traka Integration Engine Service".',
                    command: 'services.msc'
                },
                {
                    number: 7,
                    title: 'Test HTTPS Access',
                    description: 'Test accessing the Integration Engine API via https:// to confirm SSL is working.',
                    command: null
                }
            ],
            prerequisites: [
                'Valid SSL certificate',
                'Administrative access',
                'Knowledge of certificate management'
            ],
            relatedIssues: ['IE_NO_AUTH', 'IE_AUTH_NO_SSL']
        },
        {
            id: 'IE_CREDENTIALS_MISSING',
            pattern: /Integration Engine requires credentials|credentials.*missing|Business Engine credentials/i,
            severity: 'CRITICAL',
            title: 'Integration Engine Missing Business Engine Credentials',
            category: 'Configuration',
            estimatedTime: '10 minutes',
            why: 'The Integration Engine needs credentials to communicate with the Business Engine, but they haven\'t been configured.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch the Traka Admin desktop application.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to Integration Engine',
                    description: 'Go to Engines → Integration Engine configuration.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Enter Credentials',
                    description: 'Input the Business Engine API username and password.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Save Configuration',
                    description: 'Click Save to persist the credentials.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Restart Integration Engine',
                    description: 'Restart the "Traka Integration Engine Service".',
                    command: 'services.msc'
                },
                {
                    number: 6,
                    title: 'Verify Connection',
                    description: 'Check the Integration Engine log to confirm successful connection to Business Engine.',
                    command: null
                }
            ],
            prerequisites: [
                'Business Engine API credentials',
                'Access to Traka Admin',
                'Service restart permissions'
            ],
            relatedIssues: ['IE_CANNOT_CONNECT_BE']
        },
        {
            id: 'IE_CANNOT_CONNECT_BE',
            pattern: /Unable to connect to the Business Engine|Cannot connect.*Business Engine|Business Engine.*unreachable/i,
            severity: 'CRITICAL',
            title: 'Cannot Connect to Business Engine',
            category: 'Integration',
            estimatedTime: '10-15 minutes',
            why: 'The Integration Engine cannot establish a connection to the Business Engine, preventing integration functionality.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Business Engine Running',
                    description: 'Check that the "Traka Business Engine Service" is running.',
                    command: 'services.msc'
                },
                {
                    number: 2,
                    title: 'Test Network Connectivity',
                    description: 'Ping the Business Engine server if it\'s on a different machine.',
                    command: 'ping [BE-SERVER]'
                },
                {
                    number: 3,
                    title: 'Verify URL Configuration',
                    description: 'Check the Business Engine URL in Integration Engine configuration is correct (e.g., http://localhost:9998).',
                    command: null
                },
                {
                    number: 4,
                    title: 'Check Credentials',
                    description: 'Verify the Integration Engine has the correct username and password for Business Engine.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Test API Endpoint',
                    description: 'Try accessing the Business Engine API from a browser or Postman to verify it\'s responding.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Check Firewall',
                    description: 'Ensure firewall allows traffic on the Business Engine port (typically 9998).',
                    command: 'wf.msc'
                },
                {
                    number: 7,
                    title: 'Restart Services',
                    description: 'Restart both Business Engine and Integration Engine services.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to both servers',
                'Network/firewall access',
                'Service management permissions'
            ],
            relatedIssues: ['IE_CREDENTIALS_MISSING', 'BE_NOT_CURRENT']
        },
        {
            id: 'IE_NO_ENGINE_ASSOCIATION',
            pattern: /Unable to find Engine of type IntegrationEngine|IntegrationEngine.*not found|No integration engine associated/i,
            severity: 'HIGH',
            title: 'Integration Engine Not Associated with Business Engine',
            category: 'Configuration',
            estimatedTime: '10 minutes',
            why: 'The Business Engine doesn\'t have a registered Integration Engine associated with it in the database.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch the Traka Admin desktop application.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to Engines',
                    description: 'Go to the Engines section.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Create Integration Engine',
                    description: 'If the Integration Engine doesn\'t exist, create a new Integration Engine record.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Associate with Business Engine',
                    description: 'Link the Integration Engine to your Business Engine record.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Configuration',
                    description: 'Save the changes.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Services',
                    description: 'Restart both Business Engine and Integration Engine services.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to Traka Admin',
                'Database administrator rights (if creating records)'
            ],
            relatedIssues: ['BE_NOT_CURRENT']
        },
        {
            id: 'IE_API_NOT_ENABLED',
            pattern: /APIs are not enabled|API.*disabled|No access allowed/i,
            severity: 'HIGH',
            title: 'Integration Engine APIs Disabled',
            category: 'Configuration',
            estimatedTime: '5 minutes',
            why: 'The Integration Engine API endpoints have been disabled in configuration.',
            steps: [
                {
                    number: 1,
                    title: 'Locate Configuration',
                    description: 'Find the Integration Engine configuration file.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Enable APIs',
                    description: 'Set EnableAPIs=true or similar setting in the configuration.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Save File',
                    description: 'Save the configuration file.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Restart Service',
                    description: 'Restart the "Traka Integration Engine Service".',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to configuration files',
                'Service restart permissions'
            ],
            relatedIssues: []
        },

        // ========================================
        // 5. Comms Engine Communication Errors
        // ========================================
        {
            id: 'COMMS_SYSTEM_NO_PING',
            pattern: /failed to respond to pings|Error Pinging|System.*not responding/i,
            severity: 'HIGH',
            title: 'Traka System Not Responding to Ping',
            category: 'Communication',
            estimatedTime: '10-15 minutes',
            why: 'The Comms Engine cannot ping the Traka cabinet/system, indicating a network connectivity issue.',
            steps: [
                {
                    number: 1,
                    title: 'Check Physical Connection',
                    description: 'Verify the network cable is properly connected to the Traka cabinet.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Verify IP Address',
                    description: 'Check the Traka system IP address in Admin is correct.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Test from Server',
                    description: 'Open Command Prompt on the server and try: ping [cabinet-ip-address]',
                    command: 'ping [CABINET-IP]'
                },
                {
                    number: 4,
                    title: 'Check Cabinet Power',
                    description: 'Ensure the Traka cabinet is powered on and booted up.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Check Switch/Network',
                    description: 'Verify network switches between server and cabinet are operational.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Check Firewall',
                    description: 'Ensure firewall allows ICMP (ping) traffic to the cabinet IP.',
                    command: 'wf.msc'
                },
                {
                    number: 7,
                    title: 'Restart Cabinet',
                    description: 'If necessary, power cycle the Traka cabinet.',
                    command: null
                }
            ],
            prerequisites: [
                'Physical access to cabinet and network equipment',
                'Network troubleshooting tools'
            ],
            relatedIssues: ['COMMS_CANNOT_CONNECT']
        },
        {
            id: 'COMMS_CANNOT_CONNECT',
            pattern: /Could not connect to System.*at.*port|Connection to.*failed/i,
            severity: 'CRITICAL',
            title: 'Cannot Connect to Traka System',
            category: 'Communication',
            estimatedTime: '10-20 minutes',
            why: 'The Comms Engine cannot establish a TCP connection to the Traka cabinet on the specified port.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Ping Works',
                    description: 'First ensure the cabinet responds to ping (see previous solution).',
                    command: 'ping [CABINET-IP]'
                },
                {
                    number: 2,
                    title: 'Check Port Number',
                    description: 'Verify the RemotePortNo in Traka Admin is correct (typically 9997).',
                    command: null
                },
                {
                    number: 3,
                    title: 'Test Port Connectivity',
                    description: 'Test if the port is accessible: Test-NetConnection [ip] -Port [port]',
                    command: 'Test-NetConnection [CABINET-IP] -Port 9997'
                },
                {
                    number: 4,
                    title: 'Check Firewall Rules',
                    description: 'Ensure firewall allows TCP traffic on the cabinet port (9997).',
                    command: 'wf.msc'
                },
                {
                    number: 5,
                    title: 'Verify Cabinet Network Config',
                    description: 'Check the cabinet\'s network configuration is correct (may need Traka engineer).',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Comms Engine',
                    description: 'Restart the "Traka Comms Engine Service".',
                    command: 'services.msc'
                },
                {
                    number: 7,
                    title: 'Restart Cabinet',
                    description: 'If issue persists, power cycle the cabinet.',
                    command: null
                }
            ],
            prerequisites: [
                'Network access',
                'Cabinet configuration access (may need Traka engineer)',
                'Firewall management access'
            ],
            relatedIssues: ['COMMS_SYSTEM_NO_PING', 'COMMS_INVALID_PORT']
        },
        {
            id: 'COMMS_INVALID_PORT',
            pattern: /Could not parse RemotePortNo|Invalid port/i,
            severity: 'HIGH',
            title: 'Invalid System Port Number',
            category: 'Configuration',
            estimatedTime: '5 minutes',
            why: 'The port number configured for the Traka system is not a valid integer.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch the Traka Admin application.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to Systems',
                    description: 'Go to Systems/Cabinet configuration.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Find Problem System',
                    description: 'Locate the system referenced in the error log.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Correct Port Number',
                    description: 'Set RemotePortNo to a valid integer (typically 9997 for Traka cabinets).',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Changes',
                    description: 'Save the system configuration.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Comms Engine',
                    description: 'Restart the "Traka Comms Engine Service".',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to Traka Admin',
                'Knowledge of correct port number'
            ],
            relatedIssues: []
        },
        {
            id: 'COMMS_TIMEZONE_ERROR',
            pattern: /Error converting to system's timezone|No such timezone/i,
            severity: 'MEDIUM',
            title: 'Invalid Timezone Configuration',
            category: 'Configuration',
            estimatedTime: '5 minutes',
            why: 'The timezone configured for the system doesn\'t match a valid Windows timezone ID.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch Traka Admin application.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to System',
                    description: 'Find the system with the timezone error.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Check Timezone Setting',
                    description: 'View the current timezone configuration.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Set Valid Timezone',
                    description: 'Choose a valid Windows timezone (e.g., "GMT Standard Time", "Eastern Standard Time").',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Changes',
                    description: 'Save the system configuration.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Comms Engine',
                    description: 'Restart the Comms Engine service.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to Traka Admin',
                'Knowledge of correct timezone'
            ],
            relatedIssues: []
        },

        // ========================================
        // 6. OpenID/Authentication Configuration
        // ========================================
        {
            id: 'OIDC_MISSING_CONFIG',
            pattern: /missing configuration entries for OpenId|OpenId.*not configured/i,
            severity: 'HIGH',
            title: 'OpenID Connect Configuration Incomplete',
            category: 'Authentication',
            estimatedTime: '15-20 minutes',
            why: 'Required OpenID Connect configuration values are missing from web.config.',
            steps: [
                {
                    number: 1,
                    title: 'Open web.config',
                    description: 'Navigate to the TrakaWeb folder (typically C:\\inetpub\\wwwroot\\TrakaWeb) and open web.config.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Find appSettings',
                    description: 'Locate the <appSettings> section.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Add Required Settings',
                    description: 'Ensure all required OpenID settings are present: OidcAuthority, OidcClientId, OidcRedirectUri, OidcPostLogoutRedirectUri, OidcScopes.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Configure Values',
                    description: 'Fill in the values provided by your identity provider (e.g., Azure AD, Auth0).',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save File',
                    description: 'Save web.config.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart App Pool',
                    description: 'In IIS Manager, restart the TrakaWeb application pool.',
                    command: 'iisreset'
                },
                {
                    number: 7,
                    title: 'Test Login',
                    description: 'Navigate to TrakaWeb and test the OpenID Connect login flow.',
                    command: null
                }
            ],
            prerequisites: [
                'OpenID Connect provider details',
                'Access to web.config',
                'IIS management permissions'
            ],
            relatedIssues: ['OIDC_NO_CLIENT_SECRET', 'OIDC_INVALID_URL']
        },
        {
            id: 'OIDC_NO_CLIENT_SECRET',
            pattern: /Neither Client Secret nor Certificate Thumb Print|Client secret missing/i,
            severity: 'HIGH',
            title: 'OpenID Client Secret or Certificate Missing',
            category: 'Authentication',
            estimatedTime: '10 minutes',
            why: 'OpenID Connect requires either a client secret or a certificate thumbprint for authentication.',
            steps: [
                {
                    number: 1,
                    title: 'Determine Auth Method',
                    description: 'Decide whether to use Client Secret (simpler) or Certificate (more secure).',
                    command: null
                },
                {
                    number: 2,
                    title: 'Option A: Add Client Secret',
                    description: 'In web.config, add: <add key="OidcClientSecret" value="[your-secret]" />',
                    command: null
                },
                {
                    number: 3,
                    title: 'Option B: Add Certificate',
                    description: 'In web.config, add: <add key="OidcCertificateThumbPrint" value="[cert-thumbprint]" />',
                    command: null
                },
                {
                    number: 4,
                    title: 'Get Secret from Provider',
                    description: 'Obtain the client secret or certificate from your OpenID provider admin portal.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Configuration',
                    description: 'Save web.config.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart App Pool',
                    description: 'Restart the TrakaWeb application pool in IIS.',
                    command: 'iisreset'
                }
            ],
            prerequisites: [
                'OpenID client secret or certificate',
                'Access to web.config',
                'IIS permissions'
            ],
            relatedIssues: ['OIDC_MISSING_CONFIG']
        },

        // ========================================
        // 7. Email Configuration Errors
        // ========================================
        {
            id: 'EMAIL_NOT_CONFIGURED',
            pattern: /emailConfig is nothing|email needs setting up|Email host is empty/i,
            severity: 'MEDIUM',
            title: 'Email Not Configured',
            category: 'Configuration',
            estimatedTime: '10-15 minutes',
            why: 'Email functionality requires SMTP server configuration, which hasn\'t been set up.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch the Traka Admin application.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Navigate to Email Settings',
                    description: 'Go to Settings → Email Configuration.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Enter SMTP Server',
                    description: 'Input your SMTP server hostname or IP address.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Configure Port',
                    description: 'Set SMTP port (typically 25 for standard, 587 for TLS, 465 for SSL).',
                    command: null
                },
                {
                    number: 5,
                    title: 'Set Authentication',
                    description: 'If required, enable authentication and enter username/password.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Configure From Address',
                    description: 'Set the "From" email address for Traka notifications.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Test Email',
                    description: 'Use the "Send Test Email" function to verify configuration.',
                    command: null
                },
                {
                    number: 8,
                    title: 'Save Settings',
                    description: 'Save the email configuration.',
                    command: null
                }
            ],
            prerequisites: [
                'SMTP server details',
                'SMTP credentials (if required)',
                'Access to Traka Admin'
            ],
            relatedIssues: ['EMAIL_NO_USERNAME']
        },
        {
            id: 'EMAIL_NO_USERNAME',
            pattern: /Email Username is not set|credentials specified but.*username/i,
            severity: 'MEDIUM',
            title: 'Email Username Not Configured',
            category: 'Configuration',
            estimatedTime: '5 minutes',
            why: 'Email is configured to use authentication but no username has been provided.',
            steps: [
                {
                    number: 1,
                    title: 'Open Traka Admin',
                    description: 'Launch Traka Admin.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Go to Email Settings',
                    description: 'Navigate to email configuration.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Option A: Add Username',
                    description: 'Enter the SMTP authentication username.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Option B: Disable Auth',
                    description: 'If your SMTP doesn\'t require auth, disable authentication.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Save Settings',
                    description: 'Save the configuration.',
                    command: null
                }
            ],
            prerequisites: [
                'SMTP username',
                'Access to Traka Admin'
            ],
            relatedIssues: ['EMAIL_NOT_CONFIGURED']
        },

        // ========================================
        // 8. License Errors
        // ========================================
        {
            id: 'LICENSE_USER_NO_LICENSE',
            pattern: /User.*does not have a license|No license available|License limit reached/i,
            severity: 'HIGH',
            title: 'User Has No License',
            category: 'Licensing',
            estimatedTime: '5-10 minutes',
            why: 'All available licenses are in use, or the user hasn\'t been assigned a license.',
            steps: [
                {
                    number: 1,
                    title: 'Check License Count',
                    description: 'Open Traka Admin and view the license information to see total vs. used licenses.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Release Inactive Licenses',
                    description: 'In Admin, go to Active Users and sign out any users who are not actively using the system.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Check License Expiry',
                    description: 'Verify the license file hasn\'t expired.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Increase License Count',
                    description: 'If needed, contact Traka support to purchase additional licenses.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Import New License',
                    description: 'If you received a new license file, import it via Traka Admin → Licensing.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Restart Services',
                    description: 'Restart Traka services to apply the new license.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'Access to Traka Admin',
                'License file (if purchasing more licenses)'
            ],
            relatedIssues: ['LICENSE_EXPIRED']
        },
        {
            id: 'LICENSE_EXPIRED',
            pattern: /license.*expired|License check failed|current license has expired/i,
            severity: 'CRITICAL',
            title: 'Traka License Expired',
            category: 'Licensing',
            estimatedTime: '10 minutes',
            why: 'The Traka license has passed its expiration date and needs to be renewed.',
            steps: [
                {
                    number: 1,
                    title: 'Contact Traka Support',
                    description: 'Reach out to Traka support or your reseller to obtain a renewed license file.',
                    command: null
                },
                {
                    number: 2,
                    title: 'Receive License File',
                    description: 'You will receive a new .lic or .xml license file.',
                    command: null
                },
                {
                    number: 3,
                    title: 'Open Traka Admin',
                    description: 'Launch Traka Admin (you may need to use an admin override if login is blocked).',
                    command: null
                },
                {
                    number: 4,
                    title: 'Go to Licensing',
                    description: 'Navigate to the Licensing section.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Import New License',
                    description: 'Use the "Import License" function and select the new license file.',
                    command: null
                },
                {
                    number: 6,
                    title: 'Verify License',
                    description: 'Confirm the new expiration date and license details are correct.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Restart Services',
                    description: 'Restart all Traka services to apply the new license.',
                    command: 'services.msc'
                }
            ],
            prerequisites: [
                'New license file from Traka',
                'Admin access',
                'Service restart permissions'
            ],
            relatedIssues: []
        },

        // ========================================
        // 9. Service Status Errors
        // ========================================
        {
            id: 'SERVICE_NOT_RUNNING',
            pattern: /Service.*not running|Do you want to start it|Engine.*stopped/i,
            severity: 'HIGH',
            title: 'Traka Service Not Running',
            category: 'Service',
            estimatedTime: '5 minutes',
            why: 'A required Traka Windows service has stopped or failed to start.',
            steps: [
                {
                    number: 1,
                    title: 'Open Services',
                    description: 'Press Win+R, type "services.msc", press Enter.',
                    command: 'services.msc'
                },
                {
                    number: 2,
                    title: 'Locate Service',
                    description: 'Find the Traka service mentioned in the error (Business Engine, Comms Engine, Integration Engine, or Monitor).',
                    command: null
                },
                {
                    number: 3,
                    title: 'Check Status',
                    description: 'Look at the Status column - it should say "Running".',
                    command: null
                },
                {
                    number: 4,
                    title: 'Start Service',
                    description: 'If stopped, right-click the service and select "Start".',
                    command: null
                },
                {
                    number: 5,
                    title: 'Check for Errors',
                    description: 'If service fails to start, check Windows Event Viewer for error details.',
                    command: 'eventvwr.msc'
                },
                {
                    number: 6,
                    title: 'Set to Automatic',
                    description: 'Right-click service → Properties. Set "Startup type" to "Automatic" to prevent future issues.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Review Logs',
                    description: 'Check the Traka service logs for any startup errors.',
                    command: null
                }
            ],
            prerequisites: [
                'Windows service management permissions',
                'Administrative access'
            ],
            relatedIssues: ['SERVICE_NOT_INSTALLED']
        },
        {
            id: 'SERVICE_NOT_INSTALLED',
            pattern: /service.*not installed|Error.*checking service status|is the service installed/i,
            severity: 'CRITICAL',
            title: 'Traka Service Not Installed',
            category: 'Service',
            estimatedTime: '15-30 minutes',
            why: 'The Traka Windows service doesn\'t exist on this machine and needs to be installed.',
            steps: [
                {
                    number: 1,
                    title: 'Verify Service Missing',
                    description: 'Open services.msc and confirm the service is not listed.',
                    command: 'services.msc'
                },
                {
                    number: 2,
                    title: 'Locate Installer',
                    description: 'Find the Traka installation files (MSI or setup.exe).',
                    command: null
                },
                {
                    number: 3,
                    title: 'Run Installer',
                    description: 'Run the installer as Administrator and select the component that needs installing.',
                    command: null
                },
                {
                    number: 4,
                    title: 'Configure Service',
                    description: 'During installation, configure service account and settings as required.',
                    command: null
                },
                {
                    number: 5,
                    title: 'Verify Installation',
                    description: 'After installation, open services.msc and verify the service now appears.',
                    command: 'services.msc'
                },
                {
                    number: 6,
                    title: 'Start Service',
                    description: 'Start the newly installed service.',
                    command: null
                },
                {
                    number: 7,
                    title: 'Check Logs',
                    description: 'Review the service logs to ensure it started successfully.',
                    command: null
                }
            ],
            prerequisites: [
                'Traka installation files',
                'Administrative rights',
                'License file (if prompted)'
            ],
            relatedIssues: []
        }
    ]
};

/**
 * Match an error message against the solution database
 * @param {string} logMessage - The log message to match
 * @returns {object|null} - Matching solution object or null
 */
function matchSolution(logMessage) {
    for (const solution of solutionDatabase.patterns) {
        if (solution.pattern.test(logMessage)) {
            return solution;
        }
    }
    return null;
}

/**
 * Get all solutions for detected issues
 * @param {Array} issues - Array of detected issues
 * @returns {Array} - Array of issues with solutions attached
 */
function enrichIssuesWithSolutions(issues) {
    return issues.map(issue => {
        const solution = matchSolution(issue.content);
        if (solution) {
            return {
                ...issue,
                hasSolution: true,
                solution: solution
            };
        }
        return {
            ...issue,
            hasSolution: false
        };
    }).filter(issue => issue.hasSolution); // Only return issues with solutions
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { solutionDatabase, matchSolution, enrichIssuesWithSolutions };
}
