/**
 * The Interface that is responsible for a parsed lang file.
 */
export interface ParsedLangFileInterface {
  name: string
  module?: string
  translations: { [key: string]: string }
}
