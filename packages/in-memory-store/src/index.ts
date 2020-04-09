import {LocalSettings} from "./interaces/LocalSettings";
import {RedisSettings} from "./interaces/RedisSettings";
import {MemcachedSettings} from "./interaces/MemcachedSettings";
import {RedisProvider} from "./providers/redis";
import {Localprovider} from "./providers/local";
import {MemcachedProvider} from "./providers/memcached";
import {StorageProvider} from "./interaces/StorageProvider";
import { Application, Request, Response, NextFunction } from 'express';
import {isNil} from 'lodash';

class InMemoryStore implements StorageProvider {

    private static _instance: InMemoryStore;
    _provider: StorageProvider;

    private constructor(app: Application, name: string, storageSettings: LocalSettings | RedisSettings | MemcachedSettings) {
        const { conduit } = app as any;

        if (isNil(conduit)) {
            throw new Error('Conduit not initialized');
        }

        if (name === 'redis') {
            this._provider = new RedisProvider(storageSettings as RedisSettings);
        } else if (name === 'memcache') {
            this._provider = new MemcachedProvider(storageSettings as MemcachedSettings);
        } else {
            this._provider = new Localprovider(storageSettings as LocalSettings);
        }

        const admin = conduit.getAdmin();

        admin.registerRoute('POST', '/in-memory-store',
          (req: Request, res: Response, next: NextFunction) => this.adminStore(req, res, next).catch(next));

        admin.registerRoute('GET', '/in-memory-store/:key',
          (req: Request, res: Response, next: NextFunction) => this.adminGetByKey(req, res, next).catch(next));

        (app as any).conduit.inMemoryStore = this;
    }

    public static getInstance(app?: Application, name?: string, storageSettings?: LocalSettings | RedisSettings | MemcachedSettings) {
        if (!this._instance && name && storageSettings && app) {
            this._instance = new InMemoryStore(app, name, storageSettings);
        } else if (this._instance) {
            return this._instance
        } else {
            throw new Error("No settings provided to initialize");
        }
    }

    get(key: string): Promise<any> {
        return this._provider.get(key);
    }

    store(key: string, value: any): Promise<any> {
        return this._provider.store(key, value);
    }

    private async adminStore(req: Request, res: Response, next: NextFunction) {
        const {key, value} = req.body;
        if (isNil(key) || isNil(value)) {
            return res.status(401).json({error: 'Required fields are missing'});
        }

        const stored = await this.store(key, value);
        return res.json({stored});
    }

    private async adminGetByKey(req: Request, res: Response, next: NextFunction) {
        const key = req.params.key;
        if (isNil(key)) {
            return res.status(401).json({error: 'Required parameter "key" is missing'});
        }

        const stored = await this.get(key);
        return res.json({stored});
    }

}

export = InMemoryStore;

