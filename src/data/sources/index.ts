import { dataConfig } from '@/config'
import { CsvDataSource } from './CsvDataSource'
import type { DataSource } from './DataSource'

export type { DataSource } from './DataSource'
export { CsvDataSource } from './CsvDataSource'

/** The dataset the app ships with; one place to swap for an API later. */
export function defaultDataSource(): DataSource {
  return new CsvDataSource(import.meta.env.BASE_URL + dataConfig.csvUrl)
}
