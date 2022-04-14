const { Command, flags } = require('@contentstack/cli-command');
const { printFlagDeprecation } = require('@contentstack/cli-utilities');
const { isEmpty } = require('lodash');
const chalk = require('chalk');
let {
  getStack,
  getConfig,
  getToken,
  updateSingleContentTypeEntries,
  updateContentTypeForGlobalField,
} = require('../../../lib/util');

class JsonMigrationCommand extends Command {
  async run() {
    const { flags } = this.parse(JsonMigrationCommand);
    try {
      let config = await getConfig(flags);
      if (isEmpty(config.paths)) {
        throw new Error('No value provided for the "paths" property in config.');
      }
      const { alias, content_type, isGlobalField } = config;
      const token = getToken(alias);
      let stack = getStack({ token: token, host: this.cmaHost });
      config.entriesCount = 0;
      config.contentTypeCount = 0;
      config.errorEntriesUid = [];
      if (isGlobalField) {
        await updateContentTypeForGlobalField(stack, content_type, config);
      } else {
        await updateSingleContentTypeEntries(stack, content_type, config);
      }
      console.log(
        chalk.green(`Updated ${config.contentTypeCount} Content Type(s) and ${config.entriesCount} Entrie(s)`),
      );
      if (config.errorEntriesUid.length > 0) {
        console.log(chalk.red(`Faced issue while migrating some entrie(s),"${config.errorEntriesUid.join(', ')}"`));
      }
    } catch (error) {
      this.error(error.message, { exit: 2 });
    }
  }
}

JsonMigrationCommand.description = 'Migration script for migrating HTML RTE to JSON RTE';

JsonMigrationCommand.flags = {
  'config-path': flags.string({
    char: 'c',
    description: 'Path to config file to be used',
    required: false,
  }),
  alias: flags.string({
    char: 'a',
    description: 'Alias for the management token to be used',
    required: false,
  }),
  'content-type': flags.string({
    description: 'The content-type from which entries need to be migrated',
    required: false,
  }),
  'global-field': flags.boolean({
    description: 'This flag is set to false by default. It indicates that current content-type is global-field',
    default: false,
    required: false,
  }),
  yes: flags.boolean({
    char: 'y',
    description: 'Agree to process the command with the current configuration',
    default: false,
    required: false,
  }),
  'html-path': flags.string({
    description: 'Provide path of HTML RTE to migrate',
    dependsOn: ['json-path'],
    required: false,
  }),
  'json-path': flags.string({
    description: 'Provide path of JSON RTE to migrate',
    dependsOn: ['html-path'],
    required: false,
  }),
  delay: flags.integer({
    description: 'Provide delay in ms between two entry update',
    default: 1000,
    required: false,
    parse: printFlagDeprecation(['-d'], ['--delay']),
  }),

  //To be deprecated
  configPath: flags.string({
    char: 'p',
    description: 'Path to config file to be used',
    hidden: true,
    parse: printFlagDeprecation(['-p', '--configPath'], ['-c', '--config-path']),
  }),
  content_type: flags.string({
    char: 'c',
    description: 'The content-type from which entries need to be migrated',
    hidden: true,
    parse: printFlagDeprecation(['-c', '--content_type'], ['--content-type']),
  }),
  isGlobalField: flags.boolean({
    char: 'g',
    description: 'This flag is set to false by default. It indicates that current content-type is global-field',
    default: false,
    hidden: true,
    parse: printFlagDeprecation(['-g', '--isGlobalField'], ['--global-field']),
  }),
  htmlPath: flags.string({
    char: 'h',
    description: 'Provide path of HTML RTE to migrate',
    hidden: true,
    parse: printFlagDeprecation(['-h', '--htmlPath'], ['--html-path']),
  }),
  jsonPath: flags.string({
    char: 'j',
    description: 'Provide path of JSON RTE to migrate',
    hidden: true,
    parse: printFlagDeprecation(['-j', '--jsonPath'], ['--json-path']),
  }),
};

JsonMigrationCommand.examples = [
  'General Usage',
  'csdx cm:entries:migrate-html-rte --config-path path/to/config.json',
  '',
  'Using Flags',
  'csdx cm:entries:migrate-html-rte --alias alias --content-type content_type_uid --html-path html-path --json-path json-path',
  '',
  'Nested RTE',
  'csdx cm:entries:migrate-html-rte --alias alias --content-type content_type_uid --html-path modular_block_uid.block_uid.html_rte_uid --json-path modular_block_uid.block_uid.json_rte_uid',
  '',
  'csdx cm:entries:migrate-html-rte --alias alias --content-type content_type_uid --html-path group_uid.html_rte_uid --json-path group_uid.json_rte_uid',
  '',
  'Global Field',
  'csdx cm:entries:migrate-html-rte --alias alias --content-type global_field_uid --global-field --html-path html-path --json-path json-path',
];

JsonMigrationCommand.aliases = ['cm:migrate-rte'];

module.exports = JsonMigrationCommand;
