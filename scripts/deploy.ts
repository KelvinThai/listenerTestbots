import { ethers, hardhatArguments } from 'hardhat';
import * as Config from './config';

async function main() {
    await Config.initConfig();
    const network = hardhatArguments.network ? hardhatArguments.network : 'dev';
    const [deployer] = await ethers.getSigners();
    console.log('deploy from address: ', deployer.address);


    const VRFeventEmitter = await ethers.getContractFactory("VRFeventEmitter");
    const vrf = await VRFeventEmitter.deploy();
    console.log('Floppy address: ', vrf.address);
    Config.setConfig(network + '.VRFmock', vrf.address);
    await Config.updateConfig();
}

main().then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
