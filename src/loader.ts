import fs from 'fs'
import path from 'path'
import { Engine } from 'php-parser'
import { ParsedLangFileInterface } from './interfaces/parsed-lang-file'

export const hasPhpTranslations = (folderPath: string): boolean => {
  folderPath = folderPath.replace(/[\\/]$/, '') + path.sep

  try {
    const folders = fs
      .readdirSync(folderPath)
      .filter((file) => fs.statSync(folderPath + path.sep + file).isDirectory())
      .sort()

    for (const folder of folders) {
      const lang = {}

      const files = fs.readdirSync(folderPath + path.sep + folder).filter((file) => /\.php$/.test(file))

      if (files.length > 0) {
        return true
      }
    }
  } catch (e) {}

  return false
}

export const parseAll = (folderPath: string): ParsedLangFileInterface[] => {
  folderPath = folderPath.replace(/[\\/]$/, '') + path.sep

  if (!fs.existsSync(folderPath)) {
    return []
  }

  const folders = fs
    .readdirSync(folderPath)
    .filter((file) => fs.statSync(folderPath + path.sep + file).isDirectory())
    .sort()

  const data = []
  for (const folder of folders) {
    if (folder === 'vendor') {
      continue; // Don't proccess vendor overrides
    }

    const langFolderPath = folderPath + path.sep + folder
    const namespace = langFolderPath.match(/[a-zA-Z]+(?=\/Resources\/Lang)/i)
    const lang = readThroughDir(langFolderPath)

    let translation = {
      folder,
      translations: convertToDotsSyntax(lang)
    };

    if (namespace && namespace[0]) {
      translation['namespace'] = namespace[0].replace(/[A-Z]+(?![a-z])|[A-Z]/g, (str, char) => (char ? '-' : '') + str.toLowerCase())
    }

    data.push(translation);
  }

  return data
    .filter(({ translations }) => {
      return Object.keys(translations).length > 0
    })
    .map(({ namespace, folder, translations }) => {
      return {
        name: `php_${folder}.json`,
        namespace,
        translations
      }
    })
}

export const parse = (content: string) => {
  const arr = new Engine({}).parseCode(content, 'lang').children.filter((child) => child.kind === 'return')[0] as any

  if (arr?.expr?.kind !== 'array') {
    return {}
  }

  return convertToDotsSyntax(parseItem(arr.expr))
}

const parseItem = (expr) => {
  if (expr.kind === 'string') {
    return expr.value
  }

  if (expr.kind === 'array') {
    let items = expr.items.map((item) => parseItem(item))

    if (expr.items.every((item) => item.key !== null)) {
      items = items.reduce((acc, val) => Object.assign({}, acc, val), {})
    }

    return items
  }

  if (expr.kind === 'bin') {
    return parseItem(expr.left) + parseItem(expr.right)
  }

  if (expr.key) {
    return { [expr.key.value]: parseItem(expr.value) }
  }

  return parseItem(expr.value)
}

const convertToDotsSyntax = (list) => {
  const flatten = (items, context = '') => {
    const data = {}

    Object.entries(items).forEach(([key, value]) => {
      if (typeof value === 'string') {
        data[context + key] = value
        return
      }

      Object.entries(flatten(value, context + key + '.')).forEach(([itemKey, itemValue]) => {
        data[itemKey] = itemValue
      })
    })

    return data
  }

  return flatten(list)
}

export const reset = (folderPath) => {
  const dir = fs.readdirSync(folderPath)

  dir
    .filter((file) => file.match(/^php_/))
    .forEach((file) => {
      fs.unlinkSync(folderPath + file)
    })
}

export const readThroughDir = (dir) => {
  const data = {}

  fs.readdirSync(dir).forEach((file) => {
    const absoluteFile = dir + path.sep + file

    if (fs.statSync(absoluteFile).isDirectory()) {
      const subFolderFileKey = file.replace(/\.\w+$/, '')

      data[subFolderFileKey] = readThroughDir(absoluteFile)
    } else {
      data[file.replace(/\.\w+$/, '')] = parse(fs.readFileSync(absoluteFile).toString())
    }
  })

  return data
}

export const generateFiles = (langPath: string, data: ParsedLangFileInterface[]): ParsedLangFileInterface[] => {
  data = mergeData(parseOverrides(langPath, data))

  if (!fs.existsSync(langPath)) {
    fs.mkdirSync(langPath)
  }

  data.forEach(({ name, translations }) => {
    fs.writeFileSync(langPath.replace(/\/$/, '') + '/' + name, JSON.stringify(translations))
  })

  return data
}

function mergeData(data: ParsedLangFileInterface[]): ParsedLangFileInterface[] {
  const obj = {}

  data.forEach(({ name, namespace, translations }) => {
    if (!obj[name]) {
      obj[name] = {}
    }

    let mapped = {};

    Object.entries(translations).forEach(([key, val]) => {
      mapped[namespace ? `${namespace}::${key}` : key] = val;
    })

    obj[name] = { ...obj[name], ...mapped }
  })

  const arr = []
  Object.entries(obj).forEach(([name, translations]) => {
    arr.push({ name, translations })
  })

  return arr
}

function parseOverrides(langPath: string, data: ParsedLangFileInterface[]): ParsedLangFileInterface[] {
  return data.map(translation => {
    let vendorPath = `${langPath}/vendor/${translation.namespace}`.replace('/', path.sep)
    let overrides = {};

    if (!translation.namespace || !fs.existsSync(vendorPath)) {
      return translation;
    }

    parseAll(vendorPath).forEach((override) => {
      if (override.name !== translation.name) {
        return
      }

      Object.entries(override.translations).forEach(([key, val]) => {
        overrides[key] = val;
      });
    })

    return {
      ...translation, translations: { ...translation.translations, ...overrides }
    }
  });
}