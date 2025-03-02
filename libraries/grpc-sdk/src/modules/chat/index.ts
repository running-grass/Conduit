import { ConduitModule } from '../../classes/ConduitModule';
import { ChatDefinition, Room, SendMessageRequest } from '../../protoUtils/chat';

export class Chat extends ConduitModule<typeof ChatDefinition> {
  constructor(private readonly moduleName: string, url: string, grpcToken?: string) {
    super(moduleName, 'chat', url, grpcToken);
    this.initializeClient(ChatDefinition);
  }

  setConfig(newConfig: any) {
    return this.client!.setConfig({ newConfig: JSON.stringify(newConfig) }).then(res => {
      return JSON.parse(res.updatedConfig);
    });
  }

  sendMessage(messageData: SendMessageRequest): Promise<any> {
    return this.client!.sendMessage(messageData);
  }

  createRoom(name: string, participants: string[]): Promise<Room> {
    return this.client!.createRoom({ name, participants });
  }

  deleteRoom(id: string): Promise<Room> {
    return this.client!.deleteRoom({ id });
  }
}
