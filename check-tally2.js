const votes = require('./Frontend/data/votes.json');

// Find the votes with total=0
const zeroVotes = votes.votes.filter(v => (v.ayes + v.noes + v.abstain + v.absent) === 0);
console.log('Votes with total=0:');
zeroVotes.forEach(v => {
    console.log('  id:', v.id, 'date:', v.meeting_date, 'title:', v.title.substring(0, 80));
    console.log('  ayes:', v.ayes, 'noes:', v.noes, 'abstain:', v.abstain, 'absent:', v.absent);
    const detail = require('./Frontend/data/votes/' + v.id + '.json');
    console.log('  member_votes:', detail.vote.member_votes.length);
    detail.vote.member_votes.forEach(mv => console.log('    ', mv.full_name, '->', mv.vote_choice));
    console.log('');
});

// Show a typical vote from 2024+ that has 7 ayes
const sample7 = votes.votes.find(v => v.meeting_date >= '2024-01-01' && v.ayes === 7);
if (sample7) {
    console.log('\nSample 2024+ vote with 7 ayes:');
    console.log('  id:', sample7.id, 'date:', sample7.meeting_date);
    console.log('  ayes:', sample7.ayes, 'noes:', sample7.noes, 'abstain:', sample7.abstain, 'absent:', sample7.absent);
    console.log('  total:', sample7.ayes + sample7.noes + sample7.abstain + sample7.absent);
    const d = require('./Frontend/data/votes/' + sample7.id + '.json');
    d.vote.member_votes.forEach(mv => console.log('    ', mv.full_name, '->', mv.vote_choice));
}

// Show a typical 2025 Q4 vote (9 members)
const sample9 = votes.votes.find(v => v.meeting_date >= '2025-10-01' && v.ayes === 7);
if (sample9) {
    console.log('\nSample late-2025 vote with 7 ayes:');
    console.log('  id:', sample9.id, 'date:', sample9.meeting_date);
    console.log('  ayes:', sample9.ayes, 'noes:', sample9.noes, 'abstain:', sample9.abstain, 'absent:', sample9.absent);
    const d2 = require('./Frontend/data/votes/' + sample9.id + '.json');
    d2.vote.member_votes.forEach(mv => console.log('    ', mv.full_name, '->', mv.vote_choice));
}

// How many 2024+ votes have exactly 7 ayes?
const sevenAyes = votes.votes.filter(v => v.meeting_date >= '2024-01-01' && v.ayes === 7);
console.log('\n2024+ votes with exactly 7 ayes:', sevenAyes.length, 'out of', votes.votes.filter(v => v.meeting_date >= '2024-01-01').length);
