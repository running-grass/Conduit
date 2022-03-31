import { loadPackageDefinition, ServerCredentials } from '@grpc/grpc-js';
import { ManagedModule } from '../classes';
import { createServer as newServer, Server } from 'nice-grpc'

const protoLoader = require('@grpc/proto-loader');

export async function createServer(port: string): Promise<{ server: Server; port: number }> {
  let grpcServer: Server = newServer({
    'grpc.max_receive_message_length': 1024 * 1024 * 100,
    'grpc.max_send_message_length': 1024 * 1024 * 100,
  });
  let error = null;
  const retPort = await grpcServer.listen(port, ServerCredentials.createInsecure())
    .catch((err) => { error = err }) as number;
  if (error) { throw error }
  return {
    server: grpcServer,
    port: retPort
  }
}

export function addServiceToServer(
  server: Server<{}>,
  protoFilePath: string,
  descriptorObject: string,
  module: ManagedModule,
) {
  // let packageDefinition = protoLoader.loadSync(protoFilePath, {
  //   keepCase: true,
  //   longs: String,
  //   enums: String,
  //   defaults: true,
  //   oneofs: true,
  // });
  // let protoDescriptor = loadPackageDefinition(packageDefinition);
  // let objs = descriptorObject.split('.');
  // let descObj: any = protoDescriptor;
  // objs.forEach((r: string) => {
  //   descObj = descObj[r] as any;
  // });

  // @ts-ignore
  server.add(module.serviceDefinition, module.service);
}
