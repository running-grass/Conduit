import { Indexable } from '@conduitplatform/grpc-sdk';

const deepdash = require('deepdash/standalone');

function _extractNestedPopulation(path: string) {
  let paths = path.split('.');
  while (paths.indexOf('fieldsByTypeName') !== -1) {
    paths.splice(paths.indexOf('fieldsByTypeName'), 2);
  }
  path = paths.join('.');
  return path;
}

export function findPopulation(
  fields: Indexable,
  relations: string[],
): string[] | undefined {
  if (relations.length === 0) return undefined;
  let result: string[] = [];
  deepdash.eachDeep(
    fields,
    (value: Indexable, key: string, parent: Indexable, context: Indexable) => {
      if (value.fieldsByTypeName) {
        let keys = Object.keys(value.fieldsByTypeName);
        if (
          keys.length > 0 &&
          relations.indexOf(keys[0]) !== -1 &&
          result.indexOf(key) === -1
        ) {
          result.push(_extractNestedPopulation(context._item.strPath));
        }
      }
    },
  );
  return result;
}
