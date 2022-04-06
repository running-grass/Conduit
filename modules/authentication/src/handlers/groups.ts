import ConduitGrpcSdk, {
  ConduitNumber,
  ConduitRouteActions, ConduitRouteReturnDefinition, ConduitString,
  ConfigController, GrpcError, ParsedRouterRequest,
  RoutingManager, UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { Group, GroupMembership, Role, User } from '../models';
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
        path: '/group/users',
        action: ConduitRouteActions.GET,
        description: `A client lists all the members of the groups that he belongs to if he has the permission to do this.`,
        queryParams: {
          groupId: ConduitString.Optional,
          skip: ConduitNumber.Optional,
          limit: ConduitNumber.Optional,
          sort: ConduitString.Optional,
          //search: ConduitString.Optional,
        },
        middlewares: ['authMiddleware'],
      },
      new ConduitRouteReturnDefinition('GetGroupUsers', {
        users: [User.getInstance().fields],
        count: ConduitNumber.Required,
      }),
      this.getGroupUsers.bind(this),
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

  async getGroupUsers(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { user } = call.request.context;
    const { groupId, sort } = call.request.params;
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;

    const group = await Group.getInstance().findOne({ _id: groupId });
    if (isNil(group)) {
      throw new GrpcError(status.NOT_FOUND, 'Group not found');
    }

    const membership = await GroupMembership.getInstance().findOne({
      group: groupId,
      user: user._id,
    });
    // TODO Check if a user isn't member of a group if he can see the users of a group.
    if (isNil(membership)) {
      throw new GrpcError(status.PERMISSION_DENIED, 'You can not see the members of the group');
    }

    const roles: Role[] = await Role.getInstance().findMany({ name: { $in: membership.roles } });
    let canListUsers = false;
    for (const role of roles) {
      const groupRole = await Role.getInstance().findOne({
        group: group.name,
        name: role.name,
      });
      if (groupRole!.permissions.group.viewUsers) {
        canListUsers = true;
        break;
      }
    }
    if (!canListUsers) {
      throw new GrpcError(status.PERMISSION_DENIED, 'You do not have the appropriate permissions to list the users');
    }

    const groupUsers = await GroupMembership.getInstance().findMany(
      { group: groupId },
      'user',
      skip,
      limit,
      sort,
      ['user'],
    );
    const count = groupUsers.length;
    return { groupUsers, count };
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
      name: 'Owner',
      group: groupName,
      permissions: permissions,
    }); // create a default Role in the group

    const role = await Role.getInstance().create({
      name: 'User',
      group: groupName,
    });
    if (isNil(role)) {
      await Role.getInstance().create({
        name: 'User',
        group: groupName,
      }); // create a default Role in the group
    }

    await GroupMembership.getInstance().create({
      user: call.request.context.user._id,
      group: createdGroup._id,
      roles: ['Owner'],
    });

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