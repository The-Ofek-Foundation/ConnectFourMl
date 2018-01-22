"use strict"

var exec = require('child_process').exec;

var fs = require('fs')
	, util = require('util')
	, stream = require('stream')
	, es = require('event-stream');

var board, dimensions;
var redTurnGlobal;
var globalRoot;
var expansionConstant;
var aiTurn;
var monteCarloTrials;
var over, numTrials;
var ponder, pondering;
var certaintyThreshold;
var position;
var aiStopped = false;
var smartSimulation;
var increasingFactor;

var r1, r2;

var aiIdGlobal = 0; // prevents multiple Mcts recursive functions simultaneously

var winHelperGlobal = new Array(4);
var board2dGlobal;


class MctsNode {
	constructor(turn, parent, lastMove) {
		this.turn = turn;
		this.parent = parent;
		this.lastMove = lastMove;
		this.hits = 0;
		this.misses = 0;
		this.totalTries = 0;
		this.countUnexplored = 0;
		this.gameOver = -1;
	}

	chooseChild(tboard, b2d) {
		if (this.lastMove !== -1)
			tboard[this.lastMove][b2d[this.lastMove]--]
				= !this.turn ? 1:2;
		if (typeof this.children === 'undefined') {
			this.children = MctsGetChildren(this, tboard, b2d);
			if (typeof this.children !== 'undefined')
				this.countUnexplored = this.children.length;
		}
		if (this.gameOver !== -1) // next move wins
			this.backPropogate(this.gameOver === -2 ? 0:1);
		else {
			var i, unexplored = this.countUnexplored;

			if (unexplored > 0) {
				this.countUnexplored--;
				var ran = Math.floor(Math.random() * unexplored);
				for (i = 0; i < this.children.length; i++)
					if (this.children[i].totalTries === 0) {
						if (ran === 0) {
							tboard[this.children[i].lastMove][b2d[this.children[i].lastMove]--]
								= this.turn ? 1:2;
							this.children[i].runSimulation(tboard, b2d);
							return;
						}
						ran--;
					}
			} else {
				var lt = Math.log(this.totalTries);
				var bestChild = this.children[0], bestPotential = MctsChildPotential(this.children[0], lt), potential;
				for (i = 1; i < this.children.length; i++) {
					potential = MctsChildPotential(this.children[i], lt);
					if (potential > bestPotential) {
						bestPotential = potential;
						bestChild = this.children[i];
					}
				}
				bestChild.chooseChild(tboard, b2d);
			}
		}
	}

	runSimulation(tboard, b2d) {
		this.backPropogate(MctsSimulate(this, tboard, b2d, this.turn));
	}

	backPropogate(simulation) {
		if (simulation > 0)
			this.hits++;
		else if (simulation < 0)
			this.misses++;
		this.totalTries++;
		if (this.parent)
			this.parent.backPropogate(-simulation);
	}
}

pageReady();

function pageReady() {
	newGame();
}
function resultCertainty(root) {
	if (root.totalTries > (root.hits + root.misses) * 2)
		return 1 - (root.hits + root.misses) / root.totalTries;
	else if (root.hits > root.misses)
		return (root.hits - root.misses) / root.totalTries;
	else if (root.hits < root.misses)
		return (root.misses - root.hits) / root.totalTries;
	else return 1 - (root.hits + root.misses) / root.totalTries;
}

function newGame() {

	aiIdGlobal++;

	getSettings();

	over = -1;
	board = new Array(dimensions[0]);
	for (var i = 0; i < board.length; i++) {
		board[i] = new Array(dimensions[1]);
		for (var a = 0; a < board[i].length; a++)
			board[i][a] = 0;
	}

	board2dGlobal = new Array(board.length);
	for (var i = 0; i < board2dGlobal.length; i++)
		board2dGlobal[i] = dimensions[1] - 1;

	winHelperGlobal = initWinHelper();

	redTurnGlobal = true;
	position = "";

	globalRoot = createMctsRoot();
}

function getSettings() {
	ponder = false;
	aiTurn = 'second';
	dimensions = [7, 6];
	expansionConstant = 1.4970703125;
	smartSimulation = true;
	increasingFactor = 1.07;
	monteCarloTrials = 10000;
	certaintyThreshold = 0.15;
}

function getSettingsDict() {
	let settings = {};

	settings.ponder = ponder;
	settings.aiTurn = aiTurn;
	settings.dimensions = dimensions;
	settings.expansionConstant = expansionConstant;
	settings.smartSimulation = smartSimulation;
	settings.increasingFactor = increasingFactor;
	settings.monteCarloTrials = monteCarloTrials;
	settings.certaintyThreshold = certaintyThreshold;

	return settings;
}
function setupPosition(pos) {
	if (!pos || pos.length === 0) {
		position = "";
		return true;
	}

	for (var i = 0; i < pos.length; i++) {
		var col = parseInt(pos.charAt(i), 10) - 1;
		if (legalMove(board, col, false)) {
			playMove(board, col, redTurnGlobal);
			board2dGlobal[col]--;
			redTurnGlobal = !redTurnGlobal;
		} else return false;
	}
	return true;
}

function setupBoard(pos) {
	var b = new Array(dimensions[0]);
	var i, a, col;
	for (i = 0; i < dimensions[0]; i++) {
		b[i] = new Array(dimensions[1]);
		for (a = 0; a < dimensions[1]; a++)
			b[i][a] = 0;
	}
	for (i = 0; i < pos.length; i++) {
		col = parseInt(pos.charAt(i), 10) - 1;
		for (a = dimensions[1] - 1; a >= 0; a--)
			if (b[col][a] === 0) {
				b[col][a] = i % 2 === 0 ? 1:2;
				break;
			}
	}
	return b;
}

function initWinHelper() {
	var winHelper = new Array(4); // Vertical, H, D1 /, D2 \

	winHelper[0] = new Array(dimensions[0]);
	for (var i = 0; i < winHelper[0].length; i++) {
		winHelper[0][i] = new Array(2);
		winHelper[0][i][0] = 0;
		winHelper[0][i][1] = 0;
	}

	winHelper[1] = new Array(dimensions[1]);
	for (var i = 0; i < winHelper[1].length; i++) {
		winHelper[1][i] = new Array(dimensions[0]);
		for (var a = 0; a < winHelper[1][i].length; a++) {
			winHelper[1][i][a] = new Array(2);
			winHelper[1][i][a][0] = 0;
			winHelper[1][i][a][1] = 0;
		}
	}

	var numDiagonals = 1 + (dimensions[0] - 4) + (dimensions[1] - 4);
	var maxDiagonal = Math.min(dimensions[0], dimensions[1]);

	winHelper[2] = new Array(numDiagonals);
	for (var i = 0; i < winHelper[2].length; i++) {
		var diagLength = Math.min(maxDiagonal,
			3 + Math.min(i + 1, numDiagonals - i));
		winHelper[2][i] = new Array(diagLength);
		for (var a = 0; a < winHelper[2][i].length; a++) {
			winHelper[2][i][a] = new Array(2);
			winHelper[2][i][a][0] = 0;
			winHelper[2][i][a][1] = 0;
		}
	}

	winHelper[3] = new Array(numDiagonals);
	for (var i = 0; i < winHelper[3].length; i++) {
		var diagLength = Math.min(maxDiagonal,
			3 + Math.min(i + 1, numDiagonals - i));
		winHelper[3][i] = new Array(diagLength);
		for (var a = 0; a < winHelper[3][i].length; a++) {
			winHelper[3][i][a] = new Array(2);
			winHelper[3][i][a][0] = 0;
			winHelper[3][i][a][1] = 0;
		}
	}

	return winHelper;
}

function updateWinHelper(winHelper, row, col, color) {

	row = dimensions[1] - row - 1;

	// Vertical
	if (winHelper[0][col][1] === color) {
		winHelper[0][col][0]++;
		if (winHelper[0][col][0] === 4)
			return true;
	} else {
		winHelper[0][col][0] = 1;
		winHelper[0][col][1] = color;
	}

	var countLeft, countRight, i, changed;

	// Horizontal

	winHelper[1][row][col][0] = 1;
	winHelper[1][row][col][1] = color;
	countLeft = countRight = 0;
	changed = false;

	if (col !== dimensions[0] - 1
		&& winHelper[1][row][col + 1][1] === color) {

		countRight = winHelper[1][row][col + 1][0];
		changed = true;
	}

	if (col !== 0 && winHelper[1][row][col - 1][1] === color) {
		countLeft = winHelper[1][row][col - 1][0];
		changed = true;
	}

	if (changed) {
		if (countRight + countLeft + 1 >= 4) return true;

		winHelper[1][row][col - countLeft][0]
			= winHelper[1][row][col + countRight][0]
			= countRight + countLeft + 1;
	}

	var diagNum, diagIndex, maxDiags = Math.min(dimensions[0], dimensions[1]);

	// Diagonal 1 / (diagNum)
	diagNum = dimensions[1] - 4 + col - row;

	if (diagNum < maxDiags && diagNum >= 0) {
		diagIndex = Math.min(row, col);

		winHelper[2][diagNum][diagIndex][0] = 1;
		winHelper[2][diagNum][diagIndex][1] = color;
		countLeft = countRight = 0;
		changed = false;

		if (col !== dimensions[0] - 1 && row !== dimensions[1] - 1
			&& winHelper[2][diagNum][diagIndex + 1][1] === color) {

			countRight = winHelper[2][diagNum][diagIndex + 1][0];
			changed = true;
		}

		if (col !== 0 && row !== 0
			&& winHelper[2][diagNum][diagIndex - 1][1] === color) {

			countLeft = winHelper[2][diagNum][diagIndex - 1][0];
			changed = true;
		}

		if (changed) {
			if (countRight + countLeft + 1 >= 4) return true;

			winHelper[2][diagNum][diagIndex - countLeft][0]
				= winHelper[2][diagNum][diagIndex + countRight][0]
				= countRight + countLeft + 1;
		}
	}

	// Diagonal 2 \ (diagNum)
	diagNum = dimensions[1] - 4 + (dimensions[0] - col - 1) - row;

	if (diagNum < maxDiags && diagNum >= 0) {
		diagIndex = Math.min(row, dimensions[0] - col - 1);

		winHelper[3][diagNum][diagIndex][0] = 1;
		winHelper[3][diagNum][diagIndex][1] = color;
		countLeft = countRight = 0;
		changed = false;

		if (col !== 0 && row !== dimensions[1] - 1
			&& winHelper[3][diagNum][diagIndex + 1][1] === color) {

			countRight = winHelper[3][diagNum][diagIndex + 1][0];
			changed = true;
		}

		if (col !== dimensions[0] - 1 && row !== 0
			&& winHelper[3][diagNum][diagIndex - 1][1] === color) {

			countLeft = winHelper[3][diagNum][diagIndex - 1][0];
			changed = true;
		}

		if (changed) {
			if (countRight + countLeft + 1 >= 4) return true;

			winHelper[3][diagNum][diagIndex - countLeft][0]
				= winHelper[3][diagNum][diagIndex + countRight][0]
				= countRight + countLeft + 1;
		}
	}

	return false;
}

function legalMove(tboard, col, output) {
	if (col == -2)
		return false;
	if (col < 0) {
		if (output)
			alert("Please press on the board!");
		return false;
	}
	if (tboard[col][0] !== 0) {
		if (output)
			alert("Column already full!");
		return false;
	}
	return true;
}

function setTurn(turn, col, row) {

	position += col + 1;

	redTurnGlobal = turn;

	globalRoot = createMctsRoot();
	r2 = createMctsRoot();
	r2 = createMctsRoot();

	over = gameOver(board, col, row);

}

function playMove(tboard, col, turn) {
	if (tboard[col][0] !== 0)
		return -1;
	var color = turn ? 1:2, row;
	for (row = tboard[col].length - 1; tboard[col][row] !== 0; row--);
	tboard[col][row] = color;
	return row;
}

function playMoveGlobal(tboard, col, turn, winHelper, b2d) {
	var color = turn ? 1:2;
	tboard[col][b2d[col]] = color;
	if (b2d[col] === -1)
		console.error("ERROR");
	b2d[col]--;
}


function getWinningMove(tboard, b2d, turn) {
	for (var col = 0; col < tboard.length; col++) {
		if (b2d[col] === -1)
			continue;
		if (gameOverColor(tboard, col, b2d[col], turn ? 1:2) !== -1)
			return col;
	}
	return -1;
}

function cGetWinningMove(tboard, b2d, turn) {
	var color = turn ? 1:2, c = 0;
	for (var col = 0; col < tboard.length; col++) {
		if (b2d[col] === -1)
			continue;
		c++;
		if (gameOverColor(tboard, col, b2d[col], color) != -1)
			return [col, b2d[col]];
	}
	return [false, c];
}
function aGetWinningMove(tboard, b2d, turn, c) {
	var color = turn ? 1:2, a = new Array(c);
	for (var col = 0; col < tboard.length; col++) {
		if (b2d[col] === -1)
			continue;
		a[--c] = col + 1;
		if (gameOverColor(tboard, col, b2d[col], color) != -1)
			return [col, b2d[col]];
	}
	return [false, a];
}

function gameTied(b2d) {
	for (var i = 0; i < b2d.length; i++)
		if (b2d[i] !== -1)
			return false;
	return true;
}

function gameMiddle(b2d) {
	for (var i = 0; i < b2d.length; i++)
		if (i !== (dimensions[0] / 2 | 0) && b2d[i] !== dimensions[1] - 1)
			return false;
	return true;
}

function MctsGetChildren(father, tboard, b2d) {

	if (gameTied(b2d)) { // Game tied
		father.gameOver = -2;
		return [];
	}

	// win[1] stores all possible moves

	var win = cGetWinningMove(tboard, b2d, father.turn);

	if (win[0] === false)
		win = aGetWinningMove(tboard, b2d, !father.turn, win[1]);
	else {
		father.gameOver = win[0];
		return [];
	}
	if (win[0] !== false)
		return [new MctsNode(!father.turn, father, win[0])];

	if (gameMiddle(b2d)) {
		var children;
		if (b2d[dimensions[0] / 2 | 0] === -1)
			children = new Array(dimensions[0] / 2 | 0);
		else children = new Array(1 + dimensions[0] / 2 | 0);
		for (var i = 0; i < children.length; i++)
			children[i] = new MctsNode(!father.turn, father, i);
		return children;
	}

	var i = 0;
	var children = new Array(win[1].length);
	for (i = 0; i < win[1].length; i++)
		children[i] = new MctsNode(!father.turn, father, win[1][i] - 1);

	return children;
}

function ib (b1, b2) {
	for (var i = 0; i < b1.length; i++)
		if (+b1.charAt(i) != +b2.charAt(i) && +b1.charAt(i) != dimensions[0] - +b2.charAt(i))
			return false;
	return true;
}

var MctsSimulate;

function MctsDumbSimulate(father, tboard, b2d, gTurn) {
	var lastMove, turn = gTurn, done = false;
	var row, col;
	while (done == -1) {
			do {
				col = Math.random() * tboard.length | 0;
				row = playMove(tboard, col, turn);
			}	while (row === -1);
		done = gameOver(tboard, col, row);
		turn = !turn;
	}

	if (done === 0)
		return 0;
	return done == (gTurn ? 1:2) ? 1:-1;
}

var mlassists = 0, mlmode = false;

function MctsSimulateSmart(father, tboard, b2d, gTurn) {

	if (mlmode) {
		var mlresult = mlstates.getResult(tboard);


		if (mlresult != -1) {
			mlassists++;
			if (mlresult === 0)
				return 0;
			return mlresult == (gTurn ? 1:2) ? 1:-1;
		}
	}


	var turn = gTurn, done = -1;
	var row, col;

	var colsLeft = 0;
	for (var i = 0; i < b2d.length; i++)
		if (b2d[i] !== -1)
			colsLeft++;
	if (colsLeft === 0) {
		father.gameOver = -2;
		return 0;
	}

	while (done === -1) {
		col = getWinningMove(tboard, b2d, turn);
		if (col === -1)
			col = getWinningMove(tboard, b2d, !turn);
		else {
			done = turn ? 1:2;
			break;
		}

		if (col === -1)
			do {
				col = Math.random() * tboard.length | 0;
			}	while (b2d[col] === -1);

		tboard[col][b2d[col]] = turn ? 1:2;
		b2d[col]--;

		if (b2d[col] === -1) {
			colsLeft--;
			if (colsLeft === 0)
				return 0;
		}

		turn = !turn;
	}

	return done == (gTurn ? 1:2) ? 1:-1;
}

function createMctsRoot() {
	MctsSimulate = smartSimulation ? MctsSimulateSmart:MctsDumbSimulate;
	return new MctsNode(redTurnGlobal, null, -1);
}

function MctsGetNextRoot(r, col) {
	if (!r || !r.children)
		return null;
	for (var i = 0; i < r.children.length; i++)
		if (r.children[i].lastMove === col) {
			return r.children[i];
		}
	return null;
}
function getCertainty(root) {
	var bestChild = mostTriedChild(root, null);
	if (!mostTriedChild(root, bestChild))
		console.log(root, bestChild);
	var ratio = mostTriedChild(root, bestChild).totalTries / bestChild.totalTries;
	var ratioWins = bestChild.hits < bestChild.misses ? (bestChild.hits / bestChild.misses * 2):(bestChild.misses / bestChild.hits * 3);
	return ratio > ratioWins ? ratioWins:ratio;
}

function mostTriedChild(root, exclude) {
	var mostTrials = 0, child = null;
	if (!root.children)
		return null;
	if (root.children.length == 1)
		return root.children[0];
	for (var i = 0; i < root.children.length; i++)
		if (root.children[i] != exclude && root.children[i].totalTries > mostTrials) {
			mostTrials = root.children[i].totalTries;
			child = root.children[i];
		}
	return child;
}


function leastTriedChild(root) {
	var leastTrials = root.totalTries + 1, child = null;
	if (!root.children)
		return null;
	for (var i = 0; i < root.children.length; i++)
		if (root.children[i].totalTries < leastTrials) {
			leastTrials = root.children[i].totalTries;
			child = root.children[i];
		}
	return child;
}

function getMctsDepthRange() {
	var root, range = new Array(3);
	for (range[0] = -1, root = globalRoot; root && root.children; range[0]++, root = leastTriedChild(root));
	for (range[1] = -1, root = globalRoot; root && root.children; range[1]++, root = mostTriedChild(root));
	if (globalRoot.totalTries > (globalRoot.hits + globalRoot.misses) * 3)
		range[2] = "Tie";
	else if ((globalRoot.hits > globalRoot.misses) == redTurnGlobal)
		range[2] = "R";
	else if ((globalRoot.hits < globalRoot.misses) == redTurnGlobal)
		range[2] = "Y";
	else range[2] = "Tie";
	return range;
}

function getBestMoveMcts() {
	var bestChild = mostTriedChild(globalRoot, null);
	if (!bestChild)
		return globalRoot.gameOver;
	return bestChild.lastMove;
}

function fpaim() {
	aiIdGlobal++;
	var bestCol = getBestMoveMcts();
	playMoveGlobal(board, bestCol, redTurnGlobal,
		winHelperGlobal, board2dGlobal);
	setTurn(!redTurnGlobal, bestCol, board2dGlobal[bestCol] + 1);
}

function gameOver(tboard, x, y) {
	var countConsecutive = 1;
	var color = tboard[x][y];
	var i, a;

	for (i = x - 1; i >= 0 && countConsecutive < 4 && tboard[i][y] == color; i--, countConsecutive++);
	for (i = x + 1; i < tboard.length && countConsecutive < 4 && tboard[i][y] == color; i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (a = y - 1; a >= 0 && countConsecutive < 4 && tboard[x][a] == color; a--, countConsecutive++);
	for (a = y + 1; a < tboard[0].length && countConsecutive < 4 && tboard[x][a] == color; a++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (i = x - 1, a = y - 1; i >= 0 && a >= 0 && countConsecutive < 4 && tboard[i][a] == color; a--, i--, countConsecutive++);
	for (i = x + 1, a = y + 1; i < tboard.length && a < tboard[0].length && countConsecutive < 4 && tboard[i][a] == color; a++, i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (i = x - 1, a = y + 1; i >= 0 && a < tboard[0].length && countConsecutive < 4 && tboard[i][a] == color; a++, i--, countConsecutive++);
	for (i = x + 1, a = y - 1; i < tboard.length && a >= 0 && countConsecutive < 4 && tboard[i][a] == color; a--, i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	for (i = 0; i < tboard.length; i++)
		if (tboard[i][0] === 0)
			return -1;

	return 0;
}


function gameOverColor(tboard, x, y, color) {
	var countConsecutive = 1;
	var i, a;

	for (i = x - 1; i >= 0 && countConsecutive < 4 && tboard[i][y] == color; i--, countConsecutive++);
	for (i = x + 1; i < tboard.length && countConsecutive < 4 && tboard[i][y] == color; i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (a = y - 1; a >= 0 && countConsecutive < 4 && tboard[x][a] == color; a--, countConsecutive++);
	for (a = y + 1; a < tboard[0].length && countConsecutive < 4 && tboard[x][a] == color; a++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (i = x - 1, a = y - 1; i >= 0 && a >= 0 && countConsecutive < 4 && tboard[i][a] == color; a--, i--, countConsecutive++);
	for (i = x + 1, a = y + 1; i < tboard.length && a < tboard[0].length && countConsecutive < 4 && tboard[i][a] == color; a++, i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	countConsecutive = 1;

	for (i = x - 1, a = y + 1; i >= 0 && a < tboard[0].length && countConsecutive < 4 && tboard[i][a] == color; a++, i--, countConsecutive++);
	for (i = x + 1, a = y - 1; i < tboard.length && a >= 0 && countConsecutive < 4 && tboard[i][a] == color; a--, i++, countConsecutive++);

	if (countConsecutive == 4)
		return color;

	for (i = 0; i < tboard.length; i++)
		if (tboard[i][0] === 0)
			return -1;

	return 0;
}

function gameOverFull(tboard) {
	var countConsecutive = 0;
	var color = 3;
	var i, a;

	for (i = 0; i < tboard.length; i++) {
		for (a = 0; a < tboard[i].length; a++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	countConsecutive = 0;
	color = 3;

	for (a = 0; a < tboard[0].length; a++) {
		for (i = 0; i < tboard.length; i++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	countConsecutive = 0;
	color = 3;

	var x, y;

	for (x = 0; x < tboard.length; x++) {
		for (i = x, a = 0; i < tboard.length && a < tboard[i].length; i++, a++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	countConsecutive = 0;
	color = 3;

	for (y = 1; y < tboard[0].length; y++) {
		for (i = 0, a = y; i < tboard.length && a < tboard[i].length; i++, a++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	countConsecutive = 0;
	color = 3;

	for (x = 0; x < tboard.length; x++) {
		for (i = x, a = 0; i >= 0 && a < tboard[i].length; i--, a++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	countConsecutive = 0;
	color = 3;

	for (y = 1; y < tboard[0].length; y++) {
		for (i = tboard.length - 1, a = y; i >= 0 && a < tboard[i].length; i--, a++)
			if (countConsecutive < 4)
				if (tboard[i][a] === 0)
					color = 3;
				else if (tboard[i][a] == color)
					countConsecutive++;
				else {
					color = tboard[i][a];
					countConsecutive = 1;
				}
			else if (countConsecutive == 4)
				return color;
		if (countConsecutive == 4)
			return color;
		else countConsecutive = 0;
	}
	if (countConsecutive == 4)
		return color;

	for (i = 0; i < tboard.length; i++)
		if (tboard[i][0] === 0)
			return -1;

	return 0;
}

function identicalBoards(board1, board2) {
	for (var i = 0; i < board1.length / 2; i++)
		for (var a = 0; a < board1[i].length; a++)
			if (board1[i][a] != board2[board1.length - 1 - i][a])
				return false;
	return true;
}

function MctsChildPotential(child, lt) {
	var w = child.misses - child.hits;
	var n = child.totalTries;
	var c = expansionConstant;

	return w / n + c * Math.sqrt(lt / n);
}

function efficiencyTest() {
	globalRoot = createMctsRoot();
	var totalTrials, start = new Date().getTime();
	for (totalTrials = 0; totalTrials < 100000; totalTrials++)
		globalRoot.chooseChild(boardCopy(board), board2dCopy(board2dGlobal));
	console.log((new Date().getTime() - start) / 1E3);
	setInterval(function() {
		for (var i = 0; i < 1000; i++)
			globalRoot.chooseChild(boardCopy(board), board2dCopy(board2dGlobal));
		numTrialsElem.innerHTML = globalRoot.totalTries;
	}, 1);
}

exports.testMlSpeed = function(totalTrials, fileName) {
	mlmode = true;
	loadMlStates(fileName, function(lines) {
		mlstates = new MlStates(lines);
		speedTest(totalTrials);
	});
}

function speedTest(totalTrials) {
	totalTrials = totalTrials || 5E5;
	globalRoot = createMctsRoot();
	let startTime = new Date().getTime();
	while (globalRoot.totalTries < totalTrials)
		globalRoot.chooseChild(boardCopy(board), board2dCopy(board2dGlobal));
	let elapsedTime = (new Date().getTime() - startTime) / 1E3;
	console.log(Math.round(globalRoot.totalTries / elapsedTime) + ' simulations per second.');
}

function runMcts2(times, threshold, aiId) {
	if (!globalRoot)
		globalRoot = createMctsRoot();
	runMctsRecursive2(times, threshold, 0, aiId);
}

function runMctsRecursive2(times, threshold, count, aiId) {
	if (aiId !== aiIdGlobal)
		return;
	while (times > globalRoot.totalTries) {
		for (var i = 0; i < 1000; i++)
			globalRoot.chooseChild(boardCopy(board), board2dCopy(board2dGlobal));

		if (threshold > 0) {
			if (globalRoot.children.length < 2 || getCertainty(globalRoot) < threshold) {
				return;
			}
		}
	}
}

var output = false;

function mlSimulateR(numGames, nT, fileName) {
	if (numGames <= 0) {
		console.log('Done');
		return;
	}
	for (var I = 0; I < numGames && I < 500; I++) {
		numTrials = nT;
		over = -1;
		board = new Array(dimensions[0]);
		for (var i = 0; i < board.length; i++) {
			board[i] = new Array(dimensions[1]);
			for (var a = 0; a < board[i].length; a++)
				board[i][a] = 0;
		}

		board2dGlobal = new Array(board.length);
		for (var i = 0; i < board2dGlobal.length; i++)
			board2dGlobal[i] = dimensions[1] - 1;

		redTurnGlobal = true;
		position = "";

		globalRoot = createMctsRoot();


		while (over < 0) {
			runMcts2(numTrials, certaintyThreshold, aiIdGlobal);
			fpaim();

			numTrials *= 1.07;
		}
		switch (over) {
			case 0:
				if (output)
					console.log("tie");
				break;
			case 1:
				if (output)
					console.log("first player wins");
				break;
			case 2:
				if (output)
					console.log("second player wins");
				break;
		}
		mlstates.incrementLines(position, over);
		if ((I + 1) % 100 === 0) console.log(I + 1);
	}
	mlstates.saveToFile(fileName, function() {
		mlSimulateR(numGames - 500, nT, fileName);
	});
}

function mlEvaluate(numGames, nT) {
	output = true;
	var v11 = 0, v12 = 0, v21 = 0, v22 = 0;
	for (var I = 0; I < numGames; I++) {
		numTrials = nT;
		over = -1;
		board = new Array(dimensions[0]);
		for (var i = 0; i < board.length; i++) {
			board[i] = new Array(dimensions[1]);
			for (var a = 0; a < board[i].length; a++)
				board[i][a] = 0;
		}

		board2dGlobal = new Array(board.length);
		for (var i = 0; i < board2dGlobal.length; i++)
			board2dGlobal[i] = dimensions[1] - 1;

		redTurnGlobal = true;
		position = "";


		while (over < 0) {
			mlmode = redTurnGlobal === (I % 2 === 0);
			globalRoot = createMctsRoot();
			runMcts2(numTrials, certaintyThreshold, aiIdGlobal);
			fpaim();

			numTrials *= 1.07;
		}

		switch (over) {
			case 0:
				if (output)
					console.log(I + " tie");
				break;
			case 1:
				if (I % 2 === 0) {
					v11++;
					if (output)
						console.log(I + " c1 wins");
				} else {
					v21++;
					if (output)
						console.log(I + " c2 wins");
				}
				break;
			case 2:
				if (I % 2 === 0) {
					v22++;
					if (output)
						console.log(I + " c2 wins");
				} else {
					v12++;
					if (output)
						console.log(I + " c1 wins");
				}
				break;
		}
		if ((I + 1) % 100 === 0) console.log(I + 1);
	}
	console.log("!!!!!!!!");
	console.log("!!!!!!!!\n");
	console.log('Ml vs No Ml');
	console.log(`Total:  ${v11 + v12} vs ${v21 + v22}`);
	console.log(`First:  ${v11} vs ${v21}`);
	console.log(`Second: ${v12} vs ${v22}`);
	console.log("\n");
}

exports.mlTest = function(numGames, nT, fileName) {
	loadMlStates(fileName, function(lines) {
		mlstates = new MlStates(lines);
		mlEvaluate(numGames, nT, fileName);
	});
}

exports.mlSimulateGames = function(numGames, nT, fileName) {
	mlmode = true;
	expansionConstant = 10;
	loadMlStates(fileName, function(lines) {
		mlstates = new MlStates(lines);
		mlSimulateR(numGames, nT, fileName);
	});
}
function board2dCopy(b2d) {
	var newB2d = new Array(b2d.length);
	for (var i = 0; i < b2d.length; i++)
		newB2d[i] = b2d[i];
	return newB2d;
}

function boardCopy(tboard) {
	var newBoard = new Array(tboard.length);
	for (var i = 0; i < tboard.length; i++) {
		newBoard[i] = new Array(tboard[i].length);
		for (var a = 0; a < tboard[i].length; a++)
			newBoard[i][a] = tboard[i][a];
	}
	return newBoard;
}

class MlStates {

	constructor(lines) {
		// this.lines = lines;
		this.states = new Array(lines.length);
		for (var i = 0; i < this.states.length; i++)
			this.states[i] = this.getState(lines[i]);
			// this.lines[i] += '\n';
		console.log("Lines Parsed");
	}

	incrementLines(position, result) {
		var p = "";
		var hash = [0, 0, 0, 0, 0, 0, 0];
		var height = [0, 0, 0, 0, 0, 0, 0];
		for (var i = 0; i < position.length; i++) {
			var char = position.charAt(i);
			p += char;
			var col = parseInt(char) - 1;
			if (typeof col !== 'number')
				return;
			hash[col] += (i % 2 + 1) * Math.pow(3, height[col]);
			height[col]++;
			var state = this.createState(hash);
			// var state = this.getState(this.lines[index]);
			state.results[result]++;
			// this.lines[index] = state.toString();
		}
	}

	createState(hash) {
		var min = 0, max = this.states.length, comparison, mid, state;
		while (min < max) {
			mid = parseInt((min + max) / 2);
			state = this.states[mid];
			comparison = compare(state, hash);
			if (comparison == 0)
				return state;
			else if (comparison > 0)
				max = mid;
			else min = mid + 1;
		}
		var newState = this.getState(hash.join(' ') + " 0 0 0");
		this.states.splice(min, 0, newState);
		return newState;
	}

	getState(line) {
		var vals = line.split(' ');
		var hash = new Array(7);
		for (var i = 0; i < hash.length; i++)
			hash[i] = parseInt(vals[i]);

		var ties = parseInt(vals[7]);
		var blacks = parseInt(vals[8]);
		var whites = parseInt(vals[9]);

		var ran = Math.random() * (ties + blacks + whites), result = -1;
		if (ran <= ties)
			result = 0;
		else if (ran <= blacks)
			result = 1;
		else result = 2;

		return new MlState(hash, [ties, blacks, whites], result);
	}

	getResult(board) {
		var hash = getHash(board);
		var min = 0, max = this.states.length, comparison, mid, state;
		while (min < max) {
			mid = parseInt((min + max) / 2);
			state = this.states[mid];
			comparison = compare(state, hash);
			if (comparison == 0)
				return state.result;
			else if (comparison > 0)
				max = mid;
			else min = mid + 1;
		}
		return -1;
	}

	saveToFile(fileName, callback) {
		let writeStream = fs.createWriteStream(fileName + this.states.length); // unique file name (for stats)

		console.log("Saving states...");

		for (var state of this.states)
			writeStream.write(state.toString() + '\n');

		// the finish event is emitted when all data has been flushed from the stream
		writeStream.on('finish', () => {
			console.log(`Saved ${this.states.length} states.`);
			callback();
		});

		// close the stream
		writeStream.end();
	}
}

class MlState {
	constructor(hash, results, result) {
		this.hash = hash;
		this.results = results;
		this.result = result;
	}

	toString() {
		return this.hash.join(' ') + ' ' + this.results.join(' ');
	}
}

function getTrueHash(hash) {
	var trueHash = 0;
	for (var i = 0; i < 7; i++) {
		var c = hash[i] + 48;
		trueHash = (trueHash <<  5) - trueHash + c;
		trueHash = trueHash & trueHash;
	}
	return trueHash;
}


function getHash(board) {
	var hash1 = new Array(7);
	var hash2 = new Array(7);
	for (var i = 0; i < board.length; i++) {
		hash1[i] = 0;
		for (var a = 0; a < board[0].length; a++)
			hash1[i] += board[i][a] * Math.pow(3, 5 - a);
	}

	for (var i = 0; i < hash1.length; i++)
		hash2[i] = hash1[6 - i];

	if (compareHashes(hash1, hash2) < 0)
		return hash1

	return hash2;
}

function compare(state, hash) {
	return compareHashes(state.hash, hash);
}

function compareHashes(hash1, hash2) {
	for (var i = 0; i < hash1.length; i++)
		if (hash1[i] != hash2[i])
			return hash1[i] - hash2[i];
	return 0;
}


function loadMlStates(fileName, callback) {

	var lineNr = 0;

	exec('wc ' + fileName, function (error, results) {
		var numLines = parseInt(results.trim().split(/\s/g)[0]);
		var lines = new Array(numLines);
		console.log(numLines);

		var s = fs.createReadStream(fileName)
			.pipe(es.split())
			.pipe(es.mapSync(function(line){

				// pause the readstream
				s.pause();

				lines[lineNr] = line;

				lineNr += 1;

				// process line here and call s.resume() when rdy
				// function below was for logging memory usage
				// logMemoryUsage(lineNr);

				// resume the readstream, possibly from a callback
				s.resume();
			})
			.on('error', function(err){
				console.log('Error while reading file.', err);
			})
			.on('end', function(){
				console.log("File Loaded");
				callback(lines);
			})
		);
	});

};


var mlstates;

