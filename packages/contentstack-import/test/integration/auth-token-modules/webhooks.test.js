const fs = require('fs');
const path = require('path');
const { expect, test } = require('@oclif/test');
const { test: customTest } = require('@contentstack/cli-dev-dependencies');
const { messageHandler } = require('@contentstack/cli-utilities');
const LoginCommand = require('@contentstack/cli-auth/lib/commands/auth/login').default;
const RegionSetCommand = require('@contentstack/cli-config/lib/commands/config/set/region').default;
const ExportCommand = require('@contentstack/cli-cm-export/src/commands/cm/stacks/export');

const defaultConfig = require('../../../src/config/default');
const { modules } = require('../../../src/config/default');
const { getStackDetailsByRegion, cleanUp, getEnvData, getWebhooksCount } = require('../utils/helper');
const { PRINT_LOGS, IMPORT_PATH } = require('../config.json');
const { DELIMITER, KEY_VAL_DELIMITER } = process.env;
const { ENCRYPTION_KEY } = getEnvData();

const REGION_MAP = {
  NA: 'NA',
  NA_AZ: 'AZURE-NA',
  EU: 'EU',
};

module.exports = region => {
  const stackDetails = getStackDetailsByRegion(region.REGION, DELIMITER, KEY_VAL_DELIMITER);
  for (const stack of Object.keys(stackDetails)) {
    const basePath = path.join(__dirname, '..', '..', `${IMPORT_PATH}_${stack}`);
    const importBasePath = path.join(basePath, stackDetails[stack].BRANCH ? stackDetails[stack].BRANCH : 'main');
    const webhooksBasePath = path.join(importBasePath, modules.webhooks.dirName);
    const webhooksJson = path.join(webhooksBasePath, modules.webhooks.fileName);
    const messageFilePath = path.join(__dirname, '..', '..', 'messages/index.json');
    messageHandler.init({ messageFilePath });
    const username = ENCRYPTION_KEY ? crypto.decrypt(region.USERNAME) : region.USERNAME;
    const password = ENCRYPTION_KEY ? crypto.decrypt(region.PASSWORD) : region.PASSWORD;

    describe('Contentstack-import plugin test with auth token [--module=webhooks]', () => {
      customTest
        .stdout({ print: PRINT_LOGS || false })
        .command(RegionSetCommand, [REGION_MAP[stackDetails[stack].REGION_NAME]])
        .command(LoginCommand, [`-u=${username}`, `-p=${password}`])
        .it('should work without any errors', (_, done) => {
          done();
        });

      customTest
        .stdout({ print: PRINT_LOGS || false })
        .command(ExportCommand, ['--stack-api-key', stackDetails[stack].STACK_API_KEY, '--data-dir', basePath, '--module', 'webhooks'])
        .it('should work without any errors', (_, done) => {
          done();
        });

      describe('Import assets using cm:stacks:import command', () => {
        test
          .stdout({ print: PRINT_LOGS || false })
          .command(['cm:stacks:import', '--stack-api-key', stackDetails[stack].STACK_API_KEY, '--data-dir', importBasePath, '--module', 'webhooks'])
          .it('should work without any errors', async (_, done) => {
            let importedWebhooksCount = 0;
            const webhooksCount = await getWebhooksCount(stackDetails[stack]);

            try {
              if (fs.existsSync(webhooksJson)) {
                importedWebhooksCount = Object.keys(JSON.parse(fs.readFileSync(webhooksJson, 'utf-8'))).length;
              }
            } catch (error) {
              console.trace(error);
            }

            expect(webhooksCount).to.be.an('number').eq(importedWebhooksCount);
            done();
          });
      });

      after(async () => {
        await cleanUp(path.join(__dirname, '..', '..', `${IMPORT_PATH}_${stack}`));
        defaultConfig.management_token = null;
        defaultConfig.branch = null;
        defaultConfig.branches = [];
        defaultConfig.moduleName = null;
      });
    });
  }
};
