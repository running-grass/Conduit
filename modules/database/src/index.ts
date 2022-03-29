import { ModuleManager } from "@conduitplatform/grpc-sdk";
import {DatabaseServer} from "./DatabaseServer";

const dbType = process.env.DB_TYPE ??
               process.env.databaseType ?? // Compat (<=0.12.2)
               'mongodb';
const dbUri = process.env.DB_CONN_URI ??
              process.env.databaseURL ?? // Compat (<=0.12.2)
              'mongodb://localhost:27017';

const database = new DatabaseServer(dbType, dbUri);
const moduleManager = new ModuleManager(database);
moduleManager.start();
