var script = require('./uttt');

// Total:  8338 vs 860
// First:  3744 vs 176
// Second: 4594 vs 684

// 12/26/17
// Total:  8090 vs 997
// First:  3622 vs 164
// Second: 4468 vs 833


// <file-name> <num-games> <num-trials>

script.mlTest(parseInt(process.argv[3]), parseFloat(process.argv[4]), process.argv[2]);
