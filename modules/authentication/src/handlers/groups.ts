import ConduitGrpcSdk, {
  ConduitNumber,
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  ConduitString,
  ConfigController,
  GrpcError,
  ParsedRouterRequest,
  RoutingManager,
  UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { Group, GroupMembership, Role, RoleMembership, User } from '../models';
import { isNil } from 'lodash';
import { status } from '@grpc/grpc-js';
import { GroupUtils } from '../utils/groupUtils';
import { Status } from '@grpc/grpc-js/build/src/constants';

export class GroupHandlers {

  constructor(private readonly grpcSdk: ConduitGrpcSdk, private readonly routingManager: RoutingManager) {

  }

  async validate(): Promise<Boolean> {
    const config = ConfigController.getInstance().config;
    if (config.groups.enabled) {
      console.log(`Groups and Roles are active`);
      const role = await Role.getInstance().findOne({ name: 'User', group: '' });
      if (isNil(role))
        await Role.getInstance().create({ name: 'User', group: '' });
      return true;
    } else {
      console.log('Groups and Roles not active');
      return false;
    }
  }

  declareRoutes() {
    this.routingManager.route(
      {
        path: '/group/invite',
        action: ConduitRouteActions.POST,
        description: `Invites a user to a group`,
        middlewares: ['authMiddleware'],
        bodyParams: {
          groupId: ConduitString.Required,
          ids: [ConduitString.Required],
          roles: [ConduitString.Required],
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
        path: '/group/users',
        action: ConduitRouteActions.DELETE,
        description: `A client delete users from a specific group`,
        bodyParams: {
          groupId: ConduitString.Optional,
          ids: [ConduitString.Required],
        },
        middlewares: ['authMiddleware'],
      },
      new ConduitRouteReturnDefinition('RemoveUsersFromGroup', 'String'),
      this.removeUsersFromGroup.bind(this),
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

    let groupQuery;
    if (!isNil(groupId)) {
      const group = await Group.getInstance().findOne({ _id: groupId });
      groupQuery = { group: group!.name };
    } else {
      groupQuery = { group: '' };
    }
    const roles = await Role.getInstance().findMany(groupQuery)
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    const roleIds = roles.map((role) => {
      return role._id;
    });

    const roleMemberships: any = await RoleMembership.getInstance().findMany(
      { $and: [{ role: { $in: roleIds } }, { user: user._id }] },
      'role',
      undefined,
      undefined,
      undefined,
      'role',
    ).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });

    let canViewUsers: boolean = false;
    for (const roleMembership of roleMemberships) {
      const specificPermission = roleMembership?.permissions?.user?.viewUsers;
      if
      if (roleMembership.role.permissions.user.viewUsers || specificPermission) {
        canViewUsers = true;
        break;
      }
    }

    if (!canViewUsers) {
      throw new GrpcError(status.PERMISSION_DENIED, 'No permission to view the users of this group');
    }
    const memberships = await GroupMembership.getInstance().findMany(
      { group: groupId },
      'user',
      skip,
      limit,
      sort,
      'user',
    );
    const users = memberships.map((membership) => { return membership.user});

    const count = users.length;
    return { users, count };
  }

  async removeUsersFromGroup(call: ParsedRouterRequest) {
    const { groupId, ids } = call.request.params;
    const whoRemoves = call.request.context.user;
    const group = await Group.getInstance().findOne({ _id: groupId })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    const memberships = await GroupMembership.getInstance().findMany({ user: { $in: ids } })
      .catch((e: Error) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (memberships.length !== ids.length) {
      throw new GrpcError(status.NOT_FOUND, 'Some users are not members of this group');
    }
    return 5 as any;
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
      user: {
        canDelete: true,
        canReset: true,
        canInvite: true,
        viewUsers: true,
        manageUsers: true,
      },
      group: {
        canModifyRole: true,
        canDelete: true,
        viewGroups: true,
      }, // the user who creates the group  has admin rights
    };
    const ownerRole = await Role.getInstance().create({
      name: 'Owner',
      group: groupName,
      permissions: permissions,
    }).catch((e: any) => {
      throw new GrpcError(status.INTERNAL, e.message);
    }); // create a default Role in the group


    const role = await Role.getInstance().findOne({ $and: [{ name: 'User' }, { group: groupName }] })
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });

    if (isNil(role)) {
      await Role.getInstance().create({
        name: 'User',
        group: groupName,
      }).catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
      // create a default Role in the group
    }

    await GroupMembership.getInstance().create({
      user: call.request.context.user._id,
      group: createdGroup._id,
      roles: ['Owner'],
    }).catch((e: Error) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });

    await RoleMembership.getInstance().create({
      user: call.request.context.user._id,
      role: ownerRole._id,
    });

    return { createdGroup };
  }

  async inviteUser(call: ParsedRouterRequest) {
    // roles which invitor go to  give in the invited user
    // const { groupId, ids, roles } = call.request.params;
    // const invitor = call.request.context.user;
    // const group = await Group.getInstance().findOne({ _id: groupId })
    //   .catch((e: Error) => {
    //     throw new GrpcError(status.INTERNAL, e.message);
    //   });
    //
    // if (isNil(group)) {
    //   throw new GrpcError(status.NOT_FOUND, 'Group does not exist');
    // }
    //
    // // TODO What if invited user does not exist ?
    // const users = await User.getInstance().findMany({ _id: { $in: ids } });
    // if (users.length !== ids.length) {
    //   throw new GrpcError(status.NOT_FOUND, 'Some users were not found');
    // }
    //
    // let foundGroupRoles: Role[] = [];
    // if (!isNil(roles)) {
    //   foundGroupRoles = await Role.getInstance().findMany({ $and: [{ name: { $in: { roles } } }, { group: group.name }] })
    //     .catch((e: Error) => {
    //       throw new GrpcError(status.INTERNAL, e.message);
    //     });
    //   if (foundGroupRoles.length !== roles.length) {
    //     throw new GrpcError(status.NOT_FOUND, 'Some roles were not found');
    //   }
    // }
    //
    //
    // const canInvite = await GroupUtils.canInvite(invitor._id, group)
    //   .catch((e: Error) => {
    //     throw new GrpcError(status.INTERNAL, e.message);
    //   });
    //
    // if (canInvite) {
    //   for (const id of ids) {
    //     if (await GroupUtils.isGroupMember(id, groupId)) {
    //       throw new GrpcError(status.ALREADY_EXISTS, 'Cannot invite existing group user');
    //     }
    //     await GroupUtils.addGroupUser(id, group, foundGroupRoles)
    //       .catch((e: Error) => {
    //         throw new GrpcError(status.INTERNAL, e.message);
    //       });
    //   }
    // } else {
    //   throw new GrpcError(status.PERMISSION_DENIED, 'Permission denied');
    // }
    return 'Invite has been sent';
  }


}