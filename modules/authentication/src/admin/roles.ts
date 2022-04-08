import ConduitGrpcSdk, {
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { Role } from '../models';
import { Group } from '../models/Group.schema';
import { merge } from 'lodash';
import escapeStringRegexp from 'escape-string-regexp';

export class RoleManager {

  constructor(private readonly grpcSdk: ConduitGrpcSdk) { //create a
  }

  async createRole(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const roleName = call.request.params.name;
    const groupId = call.request.params.groupId ?? null;
    if (isNil(groupId)) {
      const query = { $and: [{ group: '' }, { name: roleName }] };
      const nonGroupRoleDocuments = await Role.getInstance().countDocuments(query);
      if (nonGroupRoleDocuments > 0) {
        throw new GrpcError(status.ABORTED, `Role already exists`);
      }
      return await Role.getInstance().create({ name: roleName, group: '' });
    }
    const group = await Group.getInstance().findOne({ _id: groupId });
    if (isNil(group)) {
      throw new GrpcError(status.ABORTED, `You must create a group before you create a role`);
    }
    const query = { $and: [{ name: roleName }, { group: group.name }] };
    const role = await Role.getInstance().findOne(query)
      .catch((e) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    if (!isNil(role)) {
      throw new GrpcError(status.ALREADY_EXISTS, `Role ${roleName} already exists`);
    }
    const createdRole = await Role.getInstance().create({
      name: roleName,
      group: group.name,
    });

    return { createdRole };
  }

  async patchRole(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { id, name, permissions } = call.request.params;
    let role = await Role.getInstance().findOne({ _id: id });
    if (isNil(role)) {
      throw new GrpcError(status.NOT_FOUND, `Role does not exist`);
    }
    merge(role, {
      name,
      permissions,
    });
    const updatedRole = await Role.getInstance().findByIdAndUpdate(id, role);
    return { updatedRole };
  }

  async getRoles(call: ParsedRouterRequest) {
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    const { groupNames, search, sort } = call.request.params;
    let query: any = {}, identifier;
    if (!isNil(groupNames)) {
      query['group'] = { $in: groupNames };
    }
    if (!isNil(search)) {
      identifier = escapeStringRegexp(search);
      query['name'] = { $regex: `.*${identifier}.*`, $options: 'i' };
    }

    const roles = Role.getInstance().findMany(
      query,
      undefined,
      skip,
      limit,
      sort,
    );
    return roles;
  }

}
