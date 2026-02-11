// Check votes where ayes + noes + abstain + absent doesn't match expected member count
const votes = require('./Frontend/data/votes.json');
const council = require('./Frontend/data/council.json');

// Find votes from 2024+ (when there are 9 members)
const recentVotes = votes.votes.filter(v => v.meeting_date >= '2024-01-01');
console.log('Votes from 2024+:', recentVotes.length);

// Check tally totals
const tallyCounts = {};
recentVotes.forEach(v => {
    const total = v.ayes + v.noes + v.abstain + v.absent;
    tallyCounts[total] = (tallyCounts[total] || 0) + 1;
});
console.log('\nTally totals (ayes+noes+abstain+absent) distribution for 2024+:');
Object.entries(tallyCounts).sort((a,b) => b[1]-a[1]).forEach(([total, count]) => {
    console.log(`  Total ${total}: ${count} votes`);
});

// Show a sample 7-0 vote from 2024+
const sample = recentVotes.find(v => v.ayes === 7 && v.absent === 0);
if (sample) {
    console.log('\nSample vote with 7 ayes, 0 absent (2024+):');
    console.log('  id:', sample.id, 'date:', sample.meeting_date);
    console.log('  ayes:', sample.ayes, 'noes:', sample.noes, 'abstain:', sample.abstain, 'absent:', sample.absent);
    console.log('  total:', sample.ayes + sample.noes + sample.abstain + sample.absent);

    // Load the detail file to see member votes
    const detail = require('./Frontend/data/votes/' + sample.id + '.json');
    console.log('  member_votes:');
    detail.vote.member_votes.forEach(mv => {
        console.log('    ', mv.full_name, '->', mv.vote_choice);
    });
}

// Also check a vote from 2021 (7 members)
const earlyVotes = votes.votes.filter(v => v.meeting_date < '2022-01-01');
console.log('\nVotes from 2021:', earlyVotes.length);
const earlyTallies = {};
earlyVotes.forEach(v => {
    const total = v.ayes + v.noes + v.abstain + v.absent;
    earlyTallies[total] = (earlyTallies[total] || 0) + 1;
});
console.log('Tally totals for 2021:');
Object.entries(earlyTallies).sort((a,b) => b[1]-a[1]).forEach(([total, count]) => {
    console.log(`  Total ${total}: ${count} votes`);
});
