import {
  ConduitCommons,
  ConduitRoute,
  ConduitRouteReturnDefinition,
} from '@conduitplatform/commons';
import {
  ConduitError,
  ConduitRouteActions,
  ConduitRouteParameters,
  ConduitString,
} from '@conduitplatform/grpc-sdk';
import { compare, hash } from 'bcrypt';
import { isNil } from 'lodash';
import { Admin } from '../models';

export function changePasswordRoute(conduit: ConduitCommons) {
  return new ConduitRoute(
    {
      path: '/change-password',
      action: ConduitRouteActions.POST,
      bodyParams: {
        oldPassword: ConduitString.Required,
        newPassword: ConduitString.Required,
      },
    },
    new ConduitRouteReturnDefinition('ChangePassword', {
      message: ConduitString.Required,
    }),
    async (params: ConduitRouteParameters) => {
      const { oldPassword, newPassword } = params.params!;
      const admin = params.context!.admin;
      if (isNil(oldPassword) || isNil(newPassword)) {
        throw new ConduitError(
          'INVALID_ARGUMENTS',
          400,
          'Both old and new password must be provided',
        );
      }
      const hashRounds = (await conduit.getConfigManager().get('admin')).auth.hashRounds;
      const passwordsMatch = await compare(oldPassword, admin.password);

      if (!passwordsMatch) {
        throw new ConduitError('INVALID_ARGUMENTS', 400, 'Incorrect Password');
      }
      await Admin.getInstance().findByIdAndUpdate(admin._id, {
        password: await hash(newPassword, hashRounds ?? 11),
      });
      return { result: { message: 'OK' } };
    },
  );
}
