import {
  ConduitParser,
  TYPE,
  ConduitModel,
  ConduitRouteOption,
} from '@conduitplatform/grpc-sdk';

export interface ParseResult {
  type: string;
  format?: string;
  properties?: {};
  items?: {
    type: string;
    properties: {};
  };
}

export interface SwaggerDefinition {
  type?: 'object' | 'string' | 'array' | 'boolean' | 'number';
  $ref?: string;
}

export interface SwaggerString extends SwaggerDefinition {
  type: 'string';
  format?: 'date-time';
}

export interface SwaggerObject extends SwaggerDefinition {
  type: 'object';
  properties: { [key: string]: SwaggerDefinition };
  required?: []; // empty array is invalid: https://swagger.io/docs/specification/data-models/data-types/#required
}

export interface ProcessingObject {
  type: 'object' | 'string' | 'array' | 'boolean' | 'number' | undefined;
  format?: string;
  properties?: {};
  required?: [];
  items?: SwaggerDefinition | SwaggerObject | SwaggerString;
}

export class SwaggerParser extends ConduitParser<ParseResult, ProcessingObject> {
  extractTypes(
    name: string,
    fields: ConduitModel | ConduitRouteOption | string,
    isInput: boolean,
  ): ParseResult {
    this.isInput = isInput;
    this.result = this.getInitializedResult();
    // @ts-ignore
    this.result = super.extractTypesInternal(name, fields);
    return this.result;
  }

  protected getType(conduitType: TYPE) {
    let res: {
      type?: string;
      format?: string;
      properties?: object;
    } = {};
    switch (conduitType) {
      case TYPE.JSON:
        res.type = 'object';
        res.properties = {};
        break;
      case TYPE.Date:
        res.type = 'string';
        res.format = 'date-time';
        break;
      case TYPE.ObjectId:
      case TYPE.Relation:
        res.type = 'string';
        res.format = 'uuid';
        break;
      default:
        res.type = conduitType.toLowerCase();
    }
    return res;
  }

  protected getInitializedResult() {
    return {
      type: '',
    };
  }

  protected getProcessingObject(name: string, isArray: boolean): ProcessingObject {
    return {
      type: 'object',
      properties: {},
    };
  }

  protected finalizeProcessingObject(object: ProcessingObject): ProcessingObject {
    return object;
  }

  protected getResultFromString(
    processingObject: ProcessingObject,
    name: string,
    value: any,
    isRequired: boolean = false,
    isArray: boolean,
  ): void {
    // @ts-ignore
    processingObject.properties[name] = this.getType(value);
    this.addFieldToRequired(processingObject, name, isRequired);
  }

  protected getResultFromObject(
    processingObject: ProcessingObject,
    name: string,
    fieldName: string,
    value: any,
    isRequired: boolean = false,
    isArray: boolean,
  ): void {
    // @ts-ignore
    processingObject.properties[fieldName] = {
      type: 'object',
      properties: this.extractTypes(name, value, this.isInput).properties,
    };
    this.addFieldToRequired(processingObject, fieldName, isRequired);
  }

  protected getResultFromArray(
    processingObject: ProcessingObject,
    resolverName: string,
    name: string,
    value: any[],
    isRequired: boolean = false,
    nestedType?: boolean,
  ): void {
    // @ts-ignore
    processingObject.properties[name] = {
      type: 'array',
      // @ts-ignore
      items: super.arrayHandler(resolverName, name, value).properties[name],
    };
    this.addFieldToRequired(processingObject, name, isRequired);
  }

  protected getResultFromRelation(
    processingObject: ProcessingObject,
    resolverName: string,
    name: string,
    value: any,
    isRequired: boolean = false,
    isArray: boolean,
  ): void {
    // @ts-ignore
    processingObject.properties[name] = {
      oneOf: [
        {
          $ref: `#/components/schemas/${value}`,
        },
        {
          $ref: `#/components/schemas/ModelId`,
        },
      ],
    };
    this.addFieldToRequired(processingObject, name, isRequired);
  }

  private addFieldToRequired(
    processingObject: ProcessingObject,
    name: string,
    isRequired: boolean,
  ) {
    if (isRequired) {
      if (!processingObject.required) {
        processingObject.required = [];
      }
      // @ts-ignore
      processingObject.required.push(name);
    }
  }
}
