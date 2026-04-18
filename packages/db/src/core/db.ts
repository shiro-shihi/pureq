import type { Driver } from "../drivers/types.js";
import { SelectBuilder } from "../builder/builder.js";
import type { Table } from "../schema/dsl.js";

export class DB {
  constructor(public readonly driver: Driver) {}

  select() {
    return new SelectBuilder(this);
  }

  insert<T extends Table<any, any>>(table: T) {
    return new InsertBuilder(this, table);
  }

  update<T extends Table<any, any>>(table: T) {
    return new UpdateBuilder(this, table);
  }

  delete<T extends Table<any, any>>(table: T) {
    return new DeleteBuilder(this, table);
  }
}

import { InsertBuilder, UpdateBuilder, DeleteBuilder } from "../builder/builder.js";
