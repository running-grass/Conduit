import {
  ConduitRoute,
  ConduitRouteReturnDefinition,
  RegisteredModule,
} from '@conduitplatform/commons';
import {
  ConduitRouteActions,
  ConduitError,
  ConduitString,
} from '@conduitplatform/grpc-sdk';

export function getModulesRoute(registeredModules: Map<string, RegisteredModule>) {
  return new ConduitRoute(
    {
      path: '/config/modules',
      action: ConduitRouteActions.GET,
    },
    new ConduitRouteReturnDefinition('GetModules', {
      modules: [
        {
          moduleName: ConduitString.Required,
          url: ConduitString.Required,
        },
      ],
    }),
    async () => {
      if (registeredModules.size !== 0) {
        const modules: any[] = [];
        registeredModules.forEach((value: RegisteredModule, key: string) => {
          modules.push({
            moduleName: key,
            url: value.address,
            serving: value.serving,
          });
        });
        return { result: { modules } }; // unnested from result in Rest.addConduitRoute, grpc routes avoid this using wrapRouterGrpcFunction
      } else {
        throw new ConduitError('INTERNAL', 500, 'Modules not available yet');
      }
    },
  );
}
