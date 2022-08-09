const fs = require('fs')
const path = require("path")
const { expect, test } = require("@oclif/test")
const { cliux: cliUX, messageHandler } = require("@contentstack/cli-utilities")

const { getLocalesCount } = require('./utils/helper')
const { modules } = require('../../src/config/default')
const { PRINT_LOGS, API_KEY, EXPORT_PATH, DEFAULT_TIMEOUT } = require("./config.json")

const exportBasePath = path.join(
  __dirname,
  "..",
  "..",
  EXPORT_PATH
)
const localeBasePath = path.join(
  exportBasePath,
  modules.locales.dirName
)
const localeJson = path.join(
  localeBasePath,
  modules.locales.fileName
)
const messageFilePath = path.join(
  __dirname,
  "..",
  "..",
  "messages/index.json"
)
messageHandler.init({ messageFilePath })
const { promptMessageList } = require(messageFilePath)

describe("ContentStack-Export plugin test [--module=locales]", () => {
  describe("Export locales using cm:stacks:export command without any flags", () => {
    test
      .timeout(DEFAULT_TIMEOUT || 600000) // NOTE setting default timeout as 10 minutes
      .stub(cliUX, "prompt", async (name) => {
        switch (name) {
          case promptMessageList.promptSourceStack:
            return API_KEY
          case promptMessageList.promptPathStoredData:
            return EXPORT_PATH
        }
      })
      .stdout({ print: PRINT_LOGS || false })
      .command(["cm:stacks:export", "--module", "locales"])
      .it("Check the exported locale count match with the stack locale count", async () => {
        let exportedLocaleCount = 0
        const localeCount = await getLocalesCount()

        try {
          if (fs.existsSync(localeJson)) {
            exportedLocaleCount = Object.keys(JSON.parse(fs.readFileSync(localeJson, 'utf-8'))).length
          }
        } catch (error) {
          console.trace(error)
        }

        expect(localeCount).to.be.an('number').eq(exportedLocaleCount)
      })
  })

  describe("Export locales using cm:stacks:export command with --stack-api-key=\"Stack API Key\" and --data-dir=\"export path\"", () => {
    test
      .timeout(DEFAULT_TIMEOUT || 600000) // NOTE setting default timeout as 10 minutes
      .stdout({ print: PRINT_LOGS || false })
      .command(["cm:stacks:export", "--stack-api-key", API_KEY, "--data-dir", EXPORT_PATH, "--module", "locales"])
      .it("Check the exported locale count match with the stack locale count", async () => {
        let exportedLocaleCount = 0
        const localeCount = await getLocalesCount()

        try {
          if (fs.existsSync(localeJson)) {
            exportedLocaleCount = Object.keys(JSON.parse(fs.readFileSync(localeJson, 'utf-8'))).length
          }
        } catch (error) {
          console.trace(error)
        }

        expect(localeCount).to.be.an('number').eq(exportedLocaleCount)
      })
  })
})
