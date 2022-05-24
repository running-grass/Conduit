rm -rf ./src/protoTypes
mkdir ./src/protoTypes

echo "Generating typescript code"
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto\
  --ts_proto_out=./src/protoTypes\
  --ts_proto_opt=onlyTypes=true\
  ./src/database.proto

echo "Cleaning up folders"
cp ./src/protoTypes/src/*.ts ./src/protoTypes
rm -rf ./src/protoTypes/src/