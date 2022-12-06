import { BigNumber } from '@ethersproject/bignumber';
import * as chai from 'chai';
import { expect } from 'chai';
const chaiAsPromised = require('chai-as-promised');
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';

chai.use(chaiAsPromised);

async function deployStaking(deployer: SignerWithAddress) {
    const Token = await ethers.getContractFactory("MockToken", deployer);
    const token = await Token.deploy();

    const Staking = await ethers.getContractFactory("Staking", deployer);
    const staking = await Staking.deploy(token.address);

    await token.transferOwnership(staking.address);

    await token.transfer(staking.address, BigNumber.from(100).mul(parseEther(1)));

    return [token, staking];
}

function parseEther(amount: Number) {
    return ethers.utils.parseUnits(amount.toString(), 18);
}

describe('staking contract', function() {
    
    it('should deploy', async function() {
        const [ owner ] = await ethers.getSigners();
        await deployStaking(owner);
    });

    it('should return APR index', async function() {
        const [ owner ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);

        expect(await bank.getAPRIndex(parseEther(300))).equal(BigNumber.from(999));
        expect(await bank.getAPRIndex(parseEther(500))).equal(BigNumber.from(0));
        expect(await bank.getAPRIndex(parseEther(5000))).equal(BigNumber.from(1));
        expect(await bank.getAPRIndex(parseEther(20000))).equal(BigNumber.from(2));
        expect(await bank.getAPRIndex(parseEther(40000))).equal(BigNumber.from(3));
    })

    it('should validate stake amount', async function() {
        const [ owner, staker ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init staker balance: 1,000,000 Token
        await token.transfer(staker.address, parseEther(1 * 10**6));

        // Set allowance
        await token.connect(staker).approve(bank.address, token.balanceOf(staker.address));

        await expect(bank.connect(staker).oneWeekStake(parseEther(100))).revertedWith('Invalid stake amount');
        await expect(bank.connect(staker).oneWeekStake(parseEther(200))).revertedWith('Invalid stake amount');
        await expect(bank.connect(staker).oneWeekStake(parseEther(300))).revertedWith('Invalid stake amount');
        await expect(bank.connect(staker).oneWeekStake(parseEther(400))).revertedWith('Invalid stake amount');
        await bank.connect(staker).oneWeekStake(parseEther(500));
    })

    it('should reach pool limit', async function() {
        const [ owner, staker ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init staker balance: 10,000,000 Token
        await token.transfer(staker.address, parseEther(10 * 10**6));

        await expect(bank.connect(staker).oneWeekStake(parseEther(1 * 10**6))).revertedWith('Insufficient allowance')

        // Set allowance
        await token.connect(staker).approve(bank.address, token.balanceOf(staker.address));

        // One week pool limit: 1,000,000 Token
        await expect(bank.connect(staker).oneWeekStake(parseEther(2 * 10**6))).revertedWith('One week pool limit reached')
    })

    it('should exceed balance', async function() {
        const [ owner, staker ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init staker balance: 900,000 Token
        await token.transfer(staker.address, parseEther(900 * 10**3));

        // Set allowance
        await token.connect(staker).approve(bank.address, token.balanceOf(staker.address));

        // One week pool limit: 1,000,000 Token
        await expect(bank.connect(staker).oneWeekStake(parseEther(1 * 10**6))).revertedWith('Insufficient balance')
    })

    it('should stake 1 week', async function(){
        const [ owner, staker ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);

        const bankBalanceBefore = await token.balanceOf(bank.address);
        
        // Init staker balance: 1,000,000 Token
        await token.transfer(staker.address, parseEther(1 * 10**6));

        // Set allowance
        await token.connect(staker).approve(bank.address, token.balanceOf(staker.address));

        // Stake 1,000,000 Token
        await bank.connect(staker).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(staker).oneWeekStake(parseEther(500 * 10**3));

        // Next stake should over pool limit
        await expect(bank.connect(staker).oneWeekStake(parseEther(500 * 10**3))).revertedWith('One week pool limit reached');
        
        expect(await bank.getStakeCount(staker.address)).equal(BigNumber.from(2));

        expect(await bank.totalStakeByAddress(staker.address)).equal(parseEther(1 * 10**6));

        const bankBalanceAfter = await token.balanceOf(bank.address);

        expect(bankBalanceAfter.sub(bankBalanceBefore)).equal(parseEther(1 * 10**6));
    });

    it('should stake 1 month', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);

        const bankBalanceBefore = await token.balanceOf(bank.address);
        
        // Init staker balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Stake 2,500,000 Token
        // Alice stakes 1,000,000 Token for 1 week
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));

        // Alice stakes 1,500,000 Token for 1 month
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));

        // Bob stakes 500,000 Token for 1 week
        await expect(bank.connect(bob).oneWeekStake(parseEther(500 * 10**3))).revertedWith('One week pool limit reached');

        // Bob stakes 1,000,000 Token for 1 month
        await bank.connect(bob).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(bob).oneMonthStake(parseEther(500 * 10**3));

        // Next stake should over pool limit
        await expect(bank.connect(bob).oneMonthStake(parseEther(500 * 10**3))).revertedWith('One month pool limit reached');
        
        expect(await bank.getStakeCount(alice.address)).equal(BigNumber.from(5));
        expect(await bank.getStakeCount(bob.address)).equal(BigNumber.from(2));

        expect(await bank.totalStakeByAddress(alice.address)).equal(parseEther(2500 * 10**3));
        expect(await bank.totalStakeByAddress(bob.address)).equal(parseEther(1 * 10**6));

        const bankBalanceAfter = await token.balanceOf(bank.address);

        expect(bankBalanceAfter.sub(bankBalanceBefore)).equal(parseEther(3500 * 10**3));
    })

    it('should unstake fail before release date', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 Token
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice stakes 500,000 Token for each package
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).sixMonthStake(parseEther(500 * 10**3));

        await bank.connect(bob).oneWeekStake(parseEther(500 * 10**3));

        await expect(bank.connect(alice).unStake(BigNumber.from(10))).revertedWith('Index out of bounds');

        // Alice withdraws first stake
        await expect(bank.connect(alice).unStake(BigNumber.from(0))).revertedWith("You can't unstake before release date");
    
        // Time travel to 2 months later
        await ethers.provider.send('evm_increaseTime', [2 * 30 * 24 * 60 * 60]);
        await ethers.provider.send('evm_mine', []);

        // 1 week and 1 month stake should be released
        // 3 months and 6 months stake should be locked
        await bank.connect(alice).unStake(BigNumber.from(0))
        await bank.connect(alice).unStake(BigNumber.from(1))
        await expect(bank.connect(alice).unStake(BigNumber.from(2))).revertedWith("You can't unstake before release date");
        await expect(bank.connect(alice).unStake(BigNumber.from(3))).revertedWith("You can't unstake before release date");
    })

    it('should unstake 1 time only', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 Token
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice stakes 500,000 Token for each package
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).sixMonthStake(parseEther(500 * 10**3));

        await bank.connect(bob).oneWeekStake(parseEther(500 * 10**3));
    
        // Time travel to 2 months later
        await ethers.provider.send('evm_increaseTime', [2 * 30 * 24 * 60 * 60]);
        await ethers.provider.send('evm_mine', []);

        // 1 week and 1 month stake should be released
        // 3 months and 6 months stake should be locked
        await bank.connect(alice).unStake(BigNumber.from(0))
        await bank.connect(alice).unStake(BigNumber.from(1))
        await expect(bank.connect(alice).unStake(BigNumber.from(0))).revertedWith('Stake has already been released');
        await expect(bank.connect(alice).unStake(BigNumber.from(1))).revertedWith('Stake has already been released');
    })

    it('should exceed bank balance', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);

        const bankBalanceBefore = await token.balanceOf(bank.address);
        
        // Init alice balance: 1,000,000 Token
        await token.transfer(alice.address, parseEther(1 * 10**6));
        await token.transfer(bob.address, parseEther(1 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Stake 1,000,000 Token
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(bob).oneWeekStake(parseEther(500 * 10**3));

        await expect(bank.connect(alice).unStake(BigNumber.from(1))).revertedWith('Index out of bounds');

        // Time travel to release date: 1 week
        ethers.provider.send("evm_increaseTime", [7*24*60*60]);
        ethers.provider.send("evm_mine",[]);  

        // Alice withdraws first stake
        await bank.connect(alice).unStake(BigNumber.from(0));

        // Remaining token in bank balance is not enough for Bob to withdraw
        await expect(bank.connect(bob).unStake(BigNumber.from(0))).revertedWith('Insufficient balance');

        expect(await bank.getStakeCount(alice.address)).equal(BigNumber.from(0));

        expect(await bank.getStakeCount(bob.address)).equal(BigNumber.from(1));

        expect(await bank.totalStakeByAddress(alice.address)).equal(parseEther(0));

        expect(await bank.totalStakeByAddress(bob.address)).equal(parseEther(500 * 10**3));

        const bankBalanceAfter = await token.balanceOf(bank.address);

        expect(bankBalanceAfter.sub(bankBalanceBefore)).closeTo(parseEther(500 * 10**3 - 7 * (500 *10**3) * 0.15 / 360), 10**8);
    })

    it('should stake success after release pool', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice stakes 500,000 KSC x 2 times for week package
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));

        // Bob fails to stake
        await expect(bank.connect(bob).oneWeekStake(parseEther(500 * 10**3))).revertedWith('One week pool limit reached');

        // Time travel to release date: 1 week
        await ethers.provider.send("evm_increaseTime", [7*24*60*60]);
        await ethers.provider.send("evm_mine",[]);

        // Alice withdraws first stake
        await bank.connect(alice).unStake(BigNumber.from(0));

        // Bob successfully stakes 500,000 KSC for week package
        await bank.connect(bob).oneWeekStake(parseEther(500 * 10**3));

    })

    it('should get stake history', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice stake
        await bank.connect(alice).oneWeekStake(parseEther(100 * 10**3));
        await bank.connect(alice).oneWeekStake(parseEther(200 * 10**3));

        await bank.connect(alice).oneMonthStake(parseEther(300 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(400 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));

        await bank.connect(alice).threeMonthStake(parseEther(600 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(700 * 10**3));

        await bank.connect(alice).sixMonthStake(parseEther(800 * 10**3));
        await bank.connect(alice).sixMonthStake(parseEther(900 * 10**3));

        const stakeHistory = await bank.functions['getStakerInfo(address,uint256,uint256)'](alice.address, BigNumber.from(2), BigNumber.from(6));

        for (let index = 0; index < stakeHistory[0].length; index++) {
            expect(stakeHistory[0][index]['amount']).equal(parseEther((index + 3) * 10**5));
        }

    })

    it('should get stake history by condition', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice stake
        await bank.connect(alice).oneWeekStake(parseEther(1 * 10**3));
        await bank.connect(alice).oneWeekStake(parseEther(2 * 10**3));

        await bank.connect(alice).sixMonthStake(parseEther(3 * 10**3)); // 0
        await bank.connect(alice).sixMonthStake(parseEther(4 * 10**3)); // 1
        await bank.connect(alice).sixMonthStake(parseEther(5 * 10**3)); // 2

        await bank.connect(alice).oneMonthStake(parseEther(6 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(7 * 10**3));

        await bank.connect(alice).sixMonthStake(parseEther(8 * 10**3)); // 3

        await bank.connect(alice).oneMonthStake(parseEther(9 * 10**3));

        await bank.connect(alice).sixMonthStake(parseEther(10 * 10**3)); // 4

        await bank.connect(alice).sixMonthStake(parseEther(11 * 10**3)); // 5

        const stakeHistory = await bank.getStakerInfoByTermOption(alice.address, 180, 1, 4);

        expect(stakeHistory[0]['amount']).equal(parseEther(4 * 10**3));
        expect(stakeHistory[1]['amount']).equal(parseEther(5 * 10**3));
        expect(stakeHistory[2]['amount']).equal(parseEther(8 * 10**3));
        expect(stakeHistory[3]['amount']).equal(parseEther(10 * 10**3));

    })

    it('should count stake', async function() {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        // Alice:
        // 1 week x 2
        // 1 month x 3
        // 3 months x 2
        // 6 months x 2
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneWeekStake(parseEther(500 * 10**3));

        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).oneMonthStake(parseEther(500 * 10**3));

        await bank.connect(alice).threeMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(500 * 10**3));

        await bank.connect(alice).sixMonthStake(parseEther(500 * 10**3));
        await bank.connect(alice).sixMonthStake(parseEther(500 * 10**3));

        // Bob:
        // 1 week x 1 -> fail
        // 1 month x 3 -> fail 1
        // 3 months x 3
        // 6 months x 1
        await expect(bank.connect(bob).oneWeekStake(parseEther(500 * 10**3))).revertedWith('One week pool limit reached');

        await bank.connect(bob).oneMonthStake(parseEther(500 * 10**3));
        await bank.connect(bob).oneMonthStake(parseEther(500 * 10**3));
        await expect(bank.connect(bob).oneMonthStake(parseEther(500 * 10**3))).revertedWith('One month pool limit reached');

        await bank.connect(bob).threeMonthStake(parseEther(500 * 10**3));
        await bank.connect(bob).threeMonthStake(parseEther(500 * 10**3));
        await bank.connect(bob).threeMonthStake(parseEther(500 * 10**3));

        await bank.connect(bob).sixMonthStake(parseEther(500 * 10**3));

        expect(await bank.getStakeCount(alice.address)).equal(BigNumber.from(9));
        expect(await bank.getStakeCount(bob.address)).equal(BigNumber.from(6));

        expect(await bank.totalStakeByAddress(alice.address)).equal(parseEther(4500 * 10**3));
        expect(await bank.totalStakeByAddress(bob.address)).equal(parseEther(3000 * 10**3));

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(7)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(7)))).equal(0);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(30)))).equal(3);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(30)))).equal(2);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(90)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(90)))).equal(3);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(180)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(180)))).equal(1);

        // Time travel to 1 year later
        ethers.provider.send("evm_increaseTime", [365*24*60*60]);
        ethers.provider.send("evm_mine",[]);

        // Unstakes
        // Alice:
        // 1 month x 2
        await bank.connect(alice).unStake(BigNumber.from(2));
        await bank.connect(alice).unStake(BigNumber.from(4));

        // Bob:
        // 3 months x 2
        await bank.connect(bob).unStake(BigNumber.from(2));
        await bank.connect(bob).unStake(BigNumber.from(4));
        // Stake history not change
        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(7)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(7)))).equal(0);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(30)))).equal(3);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(30)))).equal(2);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(90)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(90)))).equal(3);

        expect((await bank.totalStakerInfoByTermOption(alice.address, BigNumber.from(180)))).equal(2);
        expect((await bank.totalStakerInfoByTermOption(bob.address, BigNumber.from(180)))).equal(1);
        

        // Count by term options and release status
        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(7), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(7), false))).equal(2);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(7), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(7), false))).equal(0);

        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(30), true))).equal(2);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(30), false))).equal(1);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(30), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(30), false))).equal(2);

        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(90), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(90), false))).equal(2);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(90), true))).equal(2);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(90), false))).equal(1);

        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(180), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(alice.address, BigNumber.from(180), false))).equal(2);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(180), true))).equal(0);
        expect((await bank.totalStakerInfoByTermOptionAndRelease(bob.address, BigNumber.from(180), false))).equal(1);


        // Count by release status
        // Alice: 2 released, 7 remain
        // Bob: 2 released, 4 remain
        expect((await bank.totalStakerInfoByRelease(alice.address, true))).equal(2);
        expect((await bank.totalStakerInfoByRelease(alice.address, false))).equal(7);
        expect((await bank.totalStakerInfoByRelease(bob.address, true))).equal(2);
        expect((await bank.totalStakerInfoByRelease(bob.address, false))).equal(4);

    })

    it('should show staked pool detail', async () => {
        const [ owner, alice, bob ] = await ethers.getSigners();
        const [ token, bank ] = await deployStaking(owner);
        
        // Init alice balance: 10,000,000 KSC
        await token.transfer(alice.address, parseEther(10 * 10**6));
        await token.transfer(bob.address, parseEther(10 * 10**6));

        // Set allowance
        await token.connect(alice).approve(bank.address, token.balanceOf(alice.address));
        await token.connect(bob).approve(bank.address, token.balanceOf(bob.address));

        await bank.connect(alice).oneWeekStake(parseEther(500));
        await bank.connect(alice).oneMonthStake(parseEther(5 * 10**3));
        await bank.connect(alice).threeMonthStake(parseEther(30 * 10**3));
        await bank.connect(alice).sixMonthStake(parseEther(50 * 10**3));

        // Time travel to 1 year later
        ethers.provider.send("evm_increaseTime", [365*24*60*60]);
        ethers.provider.send("evm_mine",[]);

        await bank.connect(alice).unStake(BigNumber.from(3));

        console.log(await bank.getDetailStakedPool())

    })
    
 });
