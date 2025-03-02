rm -rf ./src/proto
mkdir ./src/proto
echo "Copying proto files from module folders"
copyfiles ../../**/src/*.proto -e ../../**/node_modules/**/*.proto -e ../../**/protos/src/**/*.proto -e ../../**/grpc_health_check.proto -f ./src/proto
copyfiles ./src/grpc_health_check.proto -f ./src/proto
rm -rf ./src/protoUtils
mkdir ./src/protoUtils

echo "Generating typescript code"
protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=outputServices=generic-definitions,useExactTypes=false \
  --ts_proto_out=./src/protoUtils \
  ./src/proto/*.proto

#protoc --plugin=./node_modules/.bin/protoc-gen-ts_proto \
#--ts_proto_opt=outputServices=grpc-js \
#--ts_proto_opt=env=node \
#--ts_proto_opt=useOptionals=true \
#--ts_proto_opt=esModuleInterop=true \
#--ts_proto_out=./src/protoUtils ./src/proto/*.proto
echo "Cleaning up folders"
rm -rf ./src/proto
cp -r ./src/protoUtils/src/proto/*.ts ./src/protoUtils
rm -rf ./src/protoUtils/src/proto/
rm -rf ./src/protoUtils/src
