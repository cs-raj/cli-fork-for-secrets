/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

let ncp = require('ncp')
let Bluebird = require('bluebird')
let fs = require('fs')
let path = require('path')
const chalk = require('chalk')

let login = require('./lib/util/login')
let util = require('./lib/util/index')
const stack = require('./lib/util/contentstack-management-sdk')
 
let {addlogs} = require('./lib/util/log')

exports.initial = function (configData) { 
  return new Promise(function (resolve, reject) {
  let config = util.initialization(configData)
  config.oldPath = config.data
  if (config && config !== undefined) {
    login(config)
    .then(function () {
      if (fs.existsSync(config.data)) {
      let migrationBackupDirPath = path.join(process.cwd(), '_backup_' + Math.floor((Math.random() * 1000)))
      return createBackup(migrationBackupDirPath, config).then((basePath) => {
        config.data = basePath
        return util.sanitizeStack(config)
      }).catch(e=>{
        console.error(e)
        process.exit(1)
      })
     .then(() => {
        let types = config.modules.types    
        if (config.moduleName && config.moduleName !== undefined) {
          singleImport(config.moduleName, types, config).then(() => {
          return resolve()
          })
        } else {
          allImport(config, types).then(() => {
          return resolve()
          })
        }
      }).catch(e=>{
        console.error(e)
        return reject(e)
        // process.exit(1)
      })
    } else {    
      let filename = path.basename(config.data)
      addlogs(config, chalk.red(filename + " Folder does not Exist"), 'error')
      return
    }
    }).catch(error => {      
      return
    })
  }
})
}


let singleImport = async (moduleName, types, config) => {
  return new Promise(async (resolve, reject) => {
  if (types.indexOf(moduleName) > -1) {
    if (!config.master_locale) {
      await stackDetails(config).then(stackResponse => {
        let master_locale = { code: stackResponse.master_locale }
        config['master_locale'] = master_locale
        return
      }).catch(error => {
        console.log("Error to fetch the stack details" + error);
      })
    }
    let exportedModule = require('./lib/import/' + moduleName)
    exportedModule.start(config).then(function () {
      addlogs(config, moduleName + ' imported successfully!', 'success')
    addlogs(config, 'The log for this is stored at ' + path.join(config.oldPath, 'logs', 'import'), 'success')
    return resolve()
    }).catch(function (error) {
      addlogs(config, 'Failed to migrate ' + moduleName, 'error')
      addlogs(config, error, 'error')
    addlogs(config, 'The log for this is stored at ' + path.join(config.oldPath, 'logs', 'import'), 'error')
    return reject()
    })
  } else {
    addlogs(config, 'Please provide valid module name.', 'error')
    return reject()
  }
})
}

let allImport = async (config, types) => {
  return new Promise(async (resolve, reject) => {
  try {
    for (let i = 0; i < types.length; i++) {
      let type = types[i]
      var exportedModule = require('./lib/import/' + type)
      if (i === 0 && !config.master_locale) {
        await stackDetails(config).then(stackResponse => {
          let master_locale = { code: stackResponse.master_locale }
          config['master_locale'] = master_locale
          return
        }).catch(error => {
          console.log("Error to fetch the stack details" + error);
        })
      }
      await exportedModule.start(config).then(result => {
        return
      })
    }
    addlogs(config, chalk.green('Stack: ' + config.target_stack + ' has been imported succesfully!'), 'success')
    addlogs(config, 'The log for this is stored at' + path.join(config.oldPath, 'logs', 'import'), 'success')
    return resolve()
  } catch (error) {
    addlogs(config, chalk.red('Failed to migrate stack: ' + config.target_stack + '. Please check error logs for more info'), 'error')
    addlogs(config, error, 'error')
    addlogs(config, 'The log for this is stored at' + path.join(config.oldPath, 'logs', 'import'), 'error')
    return reject()
  }
})
}

let stackDetails = async (credentialConfig) => {
  let client = stack.Client(credentialConfig)
  return new Promise((resolve, reject) => {
    return client.stack({api_key: credentialConfig.target_stack}).fetch()
    .then(response => {
      return resolve(response)
    }).catch(error => {
      return reject(error)
    })
  })
}

function createBackup (backupDirPath, config) {
  return new Promise((resolve, reject) => {
    if (config.hasOwnProperty('useBackedupDir') && fs.existsSync(config.useBackedupDir)) {
      return resolve(config.useBackedupDir)
    }
    ncp.limit = config.backupConcurrency || 16
    if (path.isAbsolute(config.data)) {
      return ncp(config.data, backupDirPath, (error) => {
        if (error) {
          return reject(error)
        }
        return resolve(backupDirPath)
      })
    } else {
      ncp(config.data, backupDirPath, (error) => {
        if (error) {
          return reject(error)
        }
        return resolve(backupDirPath)
      })
    }
  })
}