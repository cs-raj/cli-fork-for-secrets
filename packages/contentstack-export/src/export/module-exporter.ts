import * as path from 'path';
import { managementSDKClient } from '@contentstack/cli-utilities';
import { setupBranches, setupExportDir, log } from '../utils';
import startModuleExport from './modules';
import startJSModuleExport from './modules-js';

class ModuleExporter {
  private managementAPIClient: any;
  private exportConfig: any;
  private stackAPIClient: any;

  constructor(managementAPIClient, exportConfig) {
    this.managementAPIClient = managementAPIClient;
    this.stackAPIClient = this.managementAPIClient.stack({
      api_key: exportConfig.apiKey,
      management_token: exportConfig.mToken,
    });
    this.exportConfig = exportConfig;
  }

  async start(): Promise<any> {
    // setup the branches
    await setupBranches(this.context, this.managementAPIClient, this.exportConfig);
    await setupExportDir(this.exportConfig);
    // if branches available run it export by branches
    if (this.exportConfig.branches) {
      this.exportConfig.branchEnabled = true;
      return this.exportByBranches();
    }
    return this.export();
  }

  async exportByBranches(): Promise<any> {
    // loop through the branches and export it parallel
    for (let branch of this.exportConfig.branches) {
      try {
        this.exportConfig.branchName = branch.uid;
        this.exportConfig.branchDir = path.join(this.exportConfig.exportDir, branch.uid);
        await this.export();
      } catch (error) {
        log(this.exportConfig, `error in exporting contents branch ${branch.uid}`, 'error');
      }
    }
  }

  async export() {
    // checks for single module or all modules
    if (this.exportConfig.singleModuleExport) {
      return this.exportByModuleByName(this.exportConfig.moduleName);
    }
    return this.exportAllModules();
  }

  async exportByModuleByName(moduleName) {
    console.log('module name', moduleName);
    // export the modules by name
    // calls the module runner which inturn calls the module itself
    if (this.exportConfig.updatedModules.indexOf(moduleName) !== -1) {
      return startJSModuleExport({
        stackAPIClient: this.stackAPIClient,
        exportConfig: this.exportConfig,
        moduleName,
      });
    }
    return startModuleExport({
      stackAPIClient: this.stackAPIClient,
      exportConfig: this.exportConfig,
      moduleName,
    });
  }

  async exportAllModules(): Promise<any> {
    // use the algorithm to determine the parallel and sequential execution of modules
    for (let moduleName of this.exportConfig.moduleNames) {
      try {
        await this.exportByModuleByName(moduleName);
      } catch (error) {
        log(this.exportConfig, `failed to export the module ${moduleName}`, 'error');
      }
    }
  }
}

export default ModuleExporter;
