import { ConduitRoute, ConduitRouteReturnDefinition } from '@conduitplatform/commons';
import {
  ConduitError,
  ConduitRouteActions,
  ConduitRouteParameters,
  ConduitString,
} from '@conduitplatform/grpc-sdk';
import { isNil } from 'lodash';
import { Admin } from '../models';

export function deleteAdminUserRoute() {
  return new ConduitRoute(
    {
      path: '/admins/:id',
      action: ConduitRouteActions.DELETE,
      urlParams: {
        id: ConduitString.Required,
      },
    },
    new ConduitRouteReturnDefinition('DeleteAdminUser', {
      message: ConduitString.Required,
    }),
    async (params: ConduitRouteParameters) => {
      const { id } = params.params!;
      if (isNil(id)) {
        throw new ConduitError('INVALID_ARGUMENTS', 400, 'Id must be provided');
      }
      let admin = await Admin.getInstance().findOne({ _id: id });
      if (isNil(admin)) {
        throw new ConduitError('NOT_FOUND', 404, 'Admin not found');
      }
      if (admin._id === params.context!.admin._id) {
        throw new ConduitError('INVALID_ARGUMENTS', 400, 'Admin cannot delete self');
      }
      admin = await Admin.getInstance().deleteOne({ _id: id });
      return { result: { message: 'Admin deleted.' } };
    },
  );
}
