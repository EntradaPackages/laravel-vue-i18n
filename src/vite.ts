import path from 'path'
import { existsSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from 'fs'
import { parseAll, hasPhpTranslations, generateFiles } from './loader'
import { ParsedLangFileInterface } from './interfaces/parsed-lang-file'
import { Plugin } from 'vite'
import glob from 'glob'

export default function i18n({ langPath = 'lang', paths = ['lang'] }): Plugin {
  paths = paths.flatMap(p => glob.sync(p))

  const frameworkLangPath = 'vendor/laravel/framework/src/Illuminate/Translation/lang/'.replace('/', path.sep)
  let files: ParsedLangFileInterface[] = []
  let exitHandlersBound: boolean = false

  const clean = () => {
    paths.forEach(path => {
      files.forEach((file) => unlinkSync(path.replace(/\/$/, '') + '/' + file.name))

      files = []

      if (existsSync(path) && readdirSync(path).length < 1) {
        rmdirSync(path)
      }
    })
  }

  
  return {
    name: 'i18n',
    enforce: 'post',
    config(config) {
      files = generateFiles(langPath, [...parseAll(frameworkLangPath), ...paths.flatMap(p => parseAll(p))])

      if (!files.length) {
        return
      }

      /** @ts-ignore */
      process.env.VITE_LARAVEL_VUE_I18N_HAS_PHP = true

      return {
        define: {
          'process.env.LARAVEL_VUE_I18N_HAS_PHP': true
        }
      }
    },
    buildEnd: clean,
    handleHotUpdate(ctx) {
      if (/.*\lang\/.*\.php$/i.test(ctx.file)) {
        files = generateFiles(langPath, [...parseAll(frameworkLangPath), ...paths.flatMap(p => parseAll(p))])
      }
    },
    configureServer(server) {
      if (exitHandlersBound) {
        return
      }

      process.on('exit', clean)
      process.on('SIGINT', process.exit)
      process.on('SIGTERM', process.exit)
      process.on('SIGHUP', process.exit)

      exitHandlersBound = true
    }
  }
}
