import {
  gatewayContractRuntime,
  runAccessFlowGatewayContract,
} from './gateway-contract'
import { MemoryAccessFlowGateway } from './memory-gateway'

runAccessFlowGatewayContract('Memory', (initialState) => ({
  gateway: new MemoryAccessFlowGateway({
    ...(initialState ? { initialState } : {}),
    runtime: gatewayContractRuntime,
  }),
}))
