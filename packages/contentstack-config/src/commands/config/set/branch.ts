import { Command } from '@contentstack/cli-command';
import { cliux, flags, configHandler, messageHandler } from '@contentstack/cli-utilities';
import {interactive} from "../../../utils";

export default class BranchSetCommand extends Command {
  static description = 'Set branch for CLI';
  static flags = {
    'stack-api-key': flags.string({ char: 'k', description: 'Stack API Key' }),
    'base-branch': flags.string({ char: 'b', description: 'Base Branch' }),
  };
  static examples = [
    '$ csdx config:set:branch',
    '$ csdx config:set:branch --stack-api-key <value> --base-branch <value>',
  ];

  async run() {
    try {
      const { flags: branchSetFlags } = await this.parse(BranchSetCommand);
      let apiKey = branchSetFlags['stack-api-key'];
      let baseBranch = branchSetFlags['base-branch'];

      if (!apiKey) {
        apiKey = await interactive.askStackAPIKey();
      }

      if (!baseBranch) {
        baseBranch = await interactive.askBaseBranch();
      }

      configHandler.set(`baseBranch.${apiKey}`, baseBranch);
      cliux.success('Config is set');
    } catch (error) {
      cliux.error('error', error);
    }
  }
}
