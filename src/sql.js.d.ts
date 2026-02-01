/**
 * Type declarations for sql.js
 * @see https://sql.js.org/
 */

declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface QueryExecResult {
    columns: string[];
    values: (string | number | Uint8Array | null)[][];
  }

  export interface ParamsObject {
    [key: string]: string | number | Uint8Array | null | undefined;
  }

  export type ParamsCallback = (obj: ParamsObject) => void;
  export type BindParams =
    | unknown[]
    | ParamsObject
    | null;

  export class Statement {
    bind(params?: BindParams): boolean;
    step(): boolean;
    getAsObject(params?: BindParams): ParamsObject;
    get(params?: BindParams): (string | number | Uint8Array | null)[];
    getColumnNames(): string[];
    free(): boolean;
    freemem(): void;
    reset(): void;
    run(params?: BindParams): void;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: BindParams): Database;
    exec(sql: string, params?: BindParams): QueryExecResult[];
    each(
      sql: string,
      params: BindParams,
      callback: ParamsCallback,
      done?: () => void
    ): Database;
    each(sql: string, callback: ParamsCallback, done?: () => void): Database;
    prepare(sql: string, params?: BindParams): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    create_function(
      name: string,
      func: (...args: (string | number | Uint8Array | null)[]) => unknown
    ): Database;
    create_aggregate(
      name: string,
      init: () => unknown,
      step: (state: unknown, value: unknown) => void,
      finalize: (state: unknown) => unknown
    ): Database;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
