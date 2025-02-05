import { cliux, configHandler, NodeCrypto, managementSDKClient } from '@contentstack/cli-utilities';

import { formatError, log } from '../utils';
import { ExportConfig } from '../types';
import { askDeveloperHub } from './interactive';

export const getDeveloperHubUrl = async (exportConfig: ExportConfig) => {
  const { cma, name } = configHandler.get('region') || {};
  let developerHubBaseUrl = exportConfig?.developerHubUrls[cma];

  if (!developerHubBaseUrl) {
    developerHubBaseUrl = await askDeveloperHub(name);
  }

  return developerHubBaseUrl.startsWith('http') ? developerHubBaseUrl : `https://${developerHubBaseUrl}`;
};

export async function getOrgUid(config: ExportConfig): Promise<string> {
  const tempAPIClient = await managementSDKClient({ host: config.host });
  const tempStackData = await tempAPIClient
    .stack({ api_key: config.source_stack })
    .fetch()
    .catch((error: any) => {
      log(config, formatError(error), 'error');
    });

  return tempStackData?.org_uid;
}

export async function createNodeCryptoInstance(config: ExportConfig): Promise<NodeCrypto> {
  const cryptoArgs = { encryptionKey: '' };

  if (config.forceStopMarketplaceAppsPrompt) {
    cryptoArgs['encryptionKey'] = config.marketplaceAppEncryptionKey;
  } else {
    cryptoArgs['encryptionKey'] = await cliux.inquire({
      type: 'input',
      name: 'name',
      default: config.marketplaceAppEncryptionKey,
      validate: (url: any) => {
        if (!url) return "Encryption key can't be empty.";

        return true;
      },
      message: 'Enter marketplace app configurations encryption key',
    });
  }

  return new NodeCrypto(cryptoArgs);
}
