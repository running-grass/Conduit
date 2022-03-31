rm -rf ./protoUtils
mkdir ./protoUtils
rm -rf ./protUtils/*.ts

echo "Generating typescript code"
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=outputServices=generic-definitions,useExactTypes=false \
  --ts_proto_out=./protoUtils \
  ./src/database.proto

cp -r ./protoUtils/src/*.ts ./protoUtils/
rm -rf ./protoUtils/src