// todo Create the controller that creates REST-specific endpoints
import {
  Handler,
  IRouterMatcher,
  NextFunction,
  Request,
  Response,
  Router,
} from 'express';

import { ConduitCommons, ConduitRoute } from '@conduitplatform/commons';
import { SwaggerGenerator, SwaggerRouterMetadata } from './Swagger';
import { extractRequestData, validateParams } from './util';
import { createHashKey, extractCaching } from '../cache.utils';
import { ConduitRouter } from '../Router';
import { ConduitError, ConduitRouteActions, TYPE } from '@conduitplatform/grpc-sdk';
import { Cookie } from '../interfaces/Cookie';

const swaggerUi = require('swagger-ui-express');

export class RestController extends ConduitRouter {
  private _registeredLocalRoutes: Map<string, Handler | Handler[]>;
  private _swagger: SwaggerGenerator;

  constructor(commons: ConduitCommons, swaggerRouterMetadata: SwaggerRouterMetadata) {
    super(commons);
    this._registeredLocalRoutes = new Map();
    this._swagger = new SwaggerGenerator(swaggerRouterMetadata);
    this.initializeRouter();
  }

  registerRoute(
    path: string,
    router:
      | Router
      | ((req: Request, res: Response, next: NextFunction) => void)
      | ((req: Request, res: Response, next: NextFunction) => void)[],
  ) {
    const key = `*-${path}`;
    const registered = this._registeredLocalRoutes.has(key);
    this._registeredLocalRoutes.set(key, router);
    if (registered) {
      this.refreshRouter();
    } else {
      this.addRoute(path, router);
    }
  }

  registerConduitRoute(route: ConduitRoute) {
    const key = `${route.input.action}-${route.input.path}`;
    const registered = this._registeredRoutes.has(key);
    this._registeredRoutes.set(key, route);
    if (!registered) {
      this.addConduitRoute(route);
    }
  }

  private extractResult(returnTypeFields: String, result: any) {
    switch (returnTypeFields) {
      case TYPE.JSON:
        return JSON.parse(result);
      default:
        return result;
    }
  }

  private addRoute(
    path: string,
    router:
      | Router
      | ((req: Request, res: Response, next: NextFunction) => void)
      | ((req: Request, res: Response, next: NextFunction) => void)[],
  ) {
    this._expressRouter.use(path, router);
  }

  private addConduitRoute(route: ConduitRoute) {
    const self = this;
    let routerMethod: IRouterMatcher<Router>;

    switch (route.input.action) {
      case ConduitRouteActions.GET: {
        routerMethod = this._expressRouter.get.bind(this._expressRouter);
        break;
      }
      case ConduitRouteActions.POST: {
        routerMethod = this._expressRouter.post.bind(this._expressRouter);
        break;
      }
      case ConduitRouteActions.DELETE: {
        routerMethod = this._expressRouter.delete.bind(this._expressRouter);
        break;
      }
      case ConduitRouteActions.UPDATE: {
        routerMethod = this._expressRouter.put.bind(this._expressRouter);
        break;
      }
      case ConduitRouteActions.PATCH: {
        routerMethod = this._expressRouter.patch.bind(this._expressRouter);
        break;
      }
      default: {
        routerMethod = this._expressRouter.get.bind(this._expressRouter);
      }
    }

    routerMethod(route.input.path, this.constructHandler(route));

    this._swagger.addRouteSwaggerDocumentation(route);
  }

  constructHandler(route: ConduitRoute): (req: Request, res: Response) => void {
    const self = this;
    return (req, res) => {
      let context = extractRequestData(req);
      let hashKey: string;
      let { caching, cacheAge, scope } = extractCaching(
        route,
        req.headers['cache-control'],
      );
      self
        .checkMiddlewares(context, route.input.middlewares)
        .then(r => {
          validateParams(context.params, {
            ...route.input.bodyParams,
            ...route.input.queryParams,
            ...route.input.urlParams,
          });
          return r;
        })
        .then(r => {
          Object.assign(context.context, r);
          if (route.input.action !== ConduitRouteActions.GET) {
            return route.executeRequest(context);
          }
          if (caching) {
            hashKey = createHashKey(context.path, context.context, context.params);
            return this.findInCache(hashKey)
              .then(r => {
                if (r) {
                  return { fromCache: true, data: JSON.parse(r) };
                } else {
                  return route.executeRequest(context);
                }
              })
              .catch(() => {
                return route.executeRequest(context);
              });
          } else {
            return route.executeRequest(context);
          }
        })
        .then((r: any) => {
          if (r.redirect) {
            res.removeHeader('Authorization');
            res.removeHeader('authorization');
            res.removeHeader('clientid');
            res.removeHeader('clientsecret');
            return res.redirect(r.redirect);
          } else {
            let result;
            if (r.fromCache) {
              return res.status(200).json(r.data);
            } else {
              result = r.result ? r.result : r;
            }
            if (r.result && !(typeof route.returnTypeFields === 'string')) {
              if (typeof r.result === 'string') {
                // only grpc route data is stringified
                result = JSON.parse(result);
              }
            } else {
              result = {
                result: this.extractResult(route.returnTypeFields as string, result),
              };
            }
            if (r.setCookies && r.setCookies.length) {
              r.setCookies.forEach((cookie: Cookie) => {
                if (cookie.options.path === '') delete cookie.options.path;
                res.cookie(cookie.name, cookie.value, cookie.options);
              });
              delete result.setCookies;
            }
            if (r.removeCookies && r.removeCookies.length) {
              r.removeCookies.forEach((cookie: Cookie) => {
                res.clearCookie(cookie.name, cookie.options);
              });
            }
            if (route.input.action === ConduitRouteActions.GET && caching) {
              this.storeInCache(hashKey, result, cacheAge!);
              res.setHeader('Cache-Control', `${scope}, max-age=${cacheAge}`);
            } else {
              res.setHeader('Cache-Control', 'no-store');
            }
            res.status(200).json(result);
            res.end();
          }
        })
        .catch(this.handleError(res));
    };
  }

  handleError(res: Response): (err: Error | ConduitError) => void {
    return (err: Error | ConduitError | any) => {
      console.log(err);
      if (err.hasOwnProperty('status')) {
        return res.status((err as ConduitError).status).json({
          name: err.name,
          status: (err as ConduitError).status,
          message: err.message,
        });
      }
      if (err.hasOwnProperty('code')) {
        let statusCode: number;
        let name: string;
        switch (err.code) {
          case 3:
            name = 'INVALID_ARGUMENTS';
            statusCode = 400;
            break;
          case 5:
            name = 'NOT_FOUND';
            statusCode = 404;
            break;
          case 7:
            name = 'FORBIDDEN';
            statusCode = 403;
            break;
          case 16:
            name = 'UNAUTHORIZED';
            statusCode = 401;
            break;
          default:
            name = 'INTERNAL_SERVER_ERROR';
            statusCode = 500;
            break;
        }
        return res.status(statusCode).json({
          name,
          status: statusCode,
          message: err.details,
        });
      }
      res.status(500).json({
        name: 'INTERNAL_SERVER_ERROR',
        status: 500,
        message: 'Something went wrong',
      });
    };
  }

  protected _refreshRouter() {
    this.initializeRouter();
    this._registeredLocalRoutes.forEach((route, key) => {
      const [method, path] = key.split('-');
      this.addRoute(path, route);
    });
    this._registeredRoutes.forEach(route => {
      this.addConduitRoute(route);
    });
  }

  private initializeRouter() {
    this._expressRouter = Router();
    const self = this;
    this._expressRouter.use('/swagger', swaggerUi.serve);
    this._expressRouter.get('/swagger', (req, res, next) =>
      swaggerUi.setup(self._swagger.swaggerDoc)(req, res, next),
    );
    this._expressRouter.get('/swagger.json', (req, res) => {
      res.send(JSON.stringify(this._swagger.swaggerDoc));
    });
    this._expressRouter.use((req: Request, res: Response, next: NextFunction) => {
      next();
    });
  }
}
