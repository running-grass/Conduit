import ConduitGrpcSdk, {
  ConduitRouteActions, ConduitRouteReturnDefinition, ConduitString,
  ConfigController, GrpcError, ParsedRouterRequest,
  RoutingManager, UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { Group, Role, User } from '../models';
import { isNil } from 'lodash';
import { status } from '@grpc/grpc-js';
import { GroupUtils } from '../utils/groupUtils';
import checkPermissions = GroupUtils.checkPermissions;

export class GroupHandlers {

  constructor(private readonly grpcSdk: ConduitGrpcSdk, private readonly routingManager: RoutingManager) {

  }

  async validate(): Promise<Boolean> {
    const config = ConfigController.getInstance().config;
    if (config.groups.enabled) {
      Role.getInstance().findOne({ name: 'User' }).then((res) => {
        if (isNil(res)) {
          Role.getInstance().create({ name: 'User', group: '' }).then((role) => {
            console.log(`Groups and Roles are active`);
          });
        }
      });
      return true;
    } else {
      console.log('Groups and Roles not active');
      return false;
    }
  }

  async declareRoutes() {
    this.routingManager.route(
      {
        path: '/group/invite',
        action: ConduitRouteActions.POST,
        description: `Invites a user to a group`,
        middlewares: ['authMiddleware'],
        bodyParams: {
          groupId: ConduitString.Required,
          ids: [ConduitString.Required],
        },
      },
      new ConduitRouteReturnDefinition('InviteResponse', 'String'),
      this.inviteUser.bind(this),
    );
    this.routingManager.route(
      {
        path: '/group',
        action: ConduitRouteActions.POST,
        description: `Client creates a group`,
        middlewares: ['authMiddleware'],
        bodyParams: {
          name: ConduitString.Required,
        },
      },
      new ConduitRouteReturnDefinition('GroupResponse', Group.getInstance().fields),
      this.createGroup.bind(this),
    );
  }

  async createGroup(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const groupName = call.request.params.name;
    const group = await Group.getInstance().findOne({ name: groupName })
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(group)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Group ${groupName} already exists`);
    }

    const createdGroup = await Group.getInstance().create({
      name: groupName,
    });
    const permissions = {
      group: {
        canDelete: true,
        viewUsers: true,
        viewGroups: true,
        manageUsers: true,
      }, // the user who creates the group  has admin rights
    };
    await Role.getInstance().create({
      name: 'User',
      group: createdGroup._id,
      permissions: permissions,
    }); // create a default Role in the group

    return { createdGroup };
  }

  async inviteUser(call: ParsedRouterRequest) {
    // roles which invitor go to  give in the invited user
    const { groupId, ids } = call.request.params;
    const invitor = call.request.context.user;
    const group = await Group.getInstance().findOne({ _id: groupId })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    if (isNil(group)) {
      throw new GrpcError(status.INTERNAL, 'Group does not exists');
    }

    const users = await User.getInstance().findMany({ _id: { $in: ids } });
    if (users.length !== ids.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some user ids did not found');
    }

    checkPermissions(invitor._id, groupId, 'canInvite').then(async (canInvite: boolean) => {
      if (canInvite) {
        const ret = [];
        for (const user of users) {
          await GroupUtils.addGroupUser(user._id, groupId);
        }
      }
    }).catch((err: any) => {
      throw new GrpcError(status.PERMISSION_DENIED, err.message);
    });

    return 'Invite has been sent';
  }


}