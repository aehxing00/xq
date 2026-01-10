// 棋盘表示：1D 数组，长度 90 (10行 x 9列)
// 索引 0-8 是第一行(黑方底线), 81-89 是最后一行(红方底线)
// 棋子代码:
// 红: K(帅), A(仕), B(相), N(马), R(车), C(炮), P(兵)
// 黑: k(将), a(士), b(象), n(马), r(车), c(炮), p(卒)

const ROWS = 10;
const COLS = 9;

// 初始局面 FEN 风格
const START_FEN = [
    'r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r', // 0
    null, null, null, null, null, null, null, null, null, // 1
    null, 'c', null, null, null, null, null, 'c', null, // 2
    'p', null, 'p', null, 'p', null, 'p', null, 'p', // 3
    null, null, null, null, null, null, null, null, null, // 4
    null, null, null, null, null, null, null, null, null, // 5
    'P', null, 'P', null, 'P', null, 'P', null, 'P', // 6
    null, 'C', null, null, null, null, null, 'C', null, // 7
    null, null, null, null, null, null, null, null, null, // 8
    'R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'  // 9
];

// 棋子价值 (用于 AI 评估)
const PIECE_VALUES = {
    'k': 10000, 'a': 200, 'b': 200, 'n': 450, 'r': 1000, 'c': 500, 'p': 100,
    'K': 10000, 'A': 200, 'B': 200, 'N': 450, 'R': 1000, 'C': 500, 'P': 100
};

// 汉字映射
const PIECE_CHARS = {
    'r': '车', 'n': '马', 'b': '象', 'a': '士', 'k': '将', 'c': '炮', 'p': '卒',
    'R': '车', 'N': '马', 'B': '相', 'A': '仕', 'K': '帅', 'C': '炮', 'P': '兵'
};

// 游戏状态
let board = [];
let turn = 'red'; // 'red' or 'black'
let selectedIndex = -1;
let lastMove = null; // {from, to}
let history = [];
let gameOver = false;
let aiWorker = null; // 预留 Web Worker
let searchDepth = 4; // AI 搜索深度

// DOM 元素
const boardEl = document.getElementById('board');
const turnIndicator = document.getElementById('turn-indicator');
const aiStatus = document.getElementById('ai-status');
const restartBtn = document.getElementById('restart-btn');
const undoBtn = document.getElementById('undo-btn');
const difficultySelect = document.getElementById('difficulty');
const historyPanel = document.getElementById('move-history');
const moveSound = document.getElementById('move-sound');

// --- 初始化 ---
function initGame() {
    board = [...START_FEN];
    turn = 'red';
    selectedIndex = -1;
    lastMove = null;
    history = [];
    gameOver = false;
    searchDepth = parseInt(difficultySelect.value);
    
    updateStatus();
    renderBoard();
    updateHistoryUI();
}

restartBtn.addEventListener('click', initGame);
difficultySelect.addEventListener('change', (e) => {
    searchDepth = parseInt(e.target.value);
});
undoBtn.addEventListener('click', undoMove);

// --- 渲染 ---
function renderBoard() {
    boardEl.innerHTML = '';
    
    // 生成格子 (用于点击事件)
    for (let i = 0; i < 90; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.onclick = () => handleCellClick(i);
        
        // 绘制棋子
        const piece = board[i];
        if (piece) {
            const pieceEl = document.createElement('div');
            pieceEl.className = `piece ${isRed(piece) ? 'red' : 'black'}`;
            pieceEl.textContent = PIECE_CHARS[piece];
            
            if (i === selectedIndex) {
                pieceEl.classList.add('selected');
            }
            cell.appendChild(pieceEl);
        }
        
        // 标记最后一步
        if (lastMove && (i === lastMove.from || i === lastMove.to)) {
            cell.classList.add('last-move');
        }

        // 标记可行走位置 (如果选中了棋子)
        if (selectedIndex !== -1 && !gameOver) {
            const possibleMoves = getValidMoves(board, turn); // 这里效率较低，实际应该缓存
            // 过滤出当前选中棋子的移动
            const myMoves = possibleMoves.filter(m => m.from === selectedIndex);
            const move = myMoves.find(m => m.to === i);
            if (move) {
                if (board[i]) {
                    cell.classList.add('valid-move-capture');
                } else {
                    cell.classList.add('valid-move');
                }
            }
        }

        boardEl.appendChild(cell);
    }
}

function updateStatus() {
    if (gameOver) return;
    turnIndicator.textContent = turn === 'red' ? "红方走棋" : "黑方思考中...";
    turnIndicator.style.color = turn === 'red' ? "#c00" : "#000";
    
    if (turn === 'black') {
        aiStatus.textContent = "AI 正在计算...";
        // 延迟一下让 UI 刷新
        setTimeout(makeAiMove, 50);
    } else {
        aiStatus.textContent = "等待玩家...";
    }
}

function playSound() {
    // 简单的播放逻辑，如果有音频文件
    // moveSound.play().catch(e => {});
}

// --- 交互逻辑 ---
function handleCellClick(index) {
    if (gameOver || turn === 'black') return;

    const piece = board[index];
    
    // 如果点击的是己方棋子，选中它
    if (piece && isRed(piece)) {
        selectedIndex = index;
        renderBoard();
        return;
    }

    // 如果已经选中了棋子，且点击的是合法位置，移动
    if (selectedIndex !== -1) {
        const moves = getValidMoves(board, 'red');
        const move = moves.find(m => m.from === selectedIndex && m.to === index);
        
        if (move) {
            makeMove(move);
        } else {
            // 点击无效位置，取消选中
            // selectedIndex = -1; // Optional: click empty space to deselect
            // renderBoard();
        }
    }
}

function makeMove(move) {
    // 记录历史
    const captured = board[move.to];
    history.push({
        move: move,
        captured: captured,
        boardSnapshot: [...board], // 简单粗暴的状态保存
        turn: turn
    });

    // 执行移动
    board[move.to] = board[move.from];
    board[move.from] = null;
    lastMove = move;
    selectedIndex = -1;
    
    playSound();
    
    // 检查是否结束
    const kingChar = turn === 'red' ? 'k' : 'K'; // 对方将帅
    if (captured === kingChar) {
        alert(turn === 'red' ? "红方胜利！" : "黑方胜利！");
        gameOver = true;
        renderBoard();
        return;
    }

    // 切换回合
    turn = turn === 'red' ? 'black' : 'red';
    renderBoard();
    updateStatus();
    updateHistoryUI();
}

function undoMove() {
    if (history.length === 0 || gameOver) return;
    
    // 如果是玩家回合，通常需要悔两步（回到玩家上一步）
    // 如果 AI 还在思考，禁止悔棋
    if (turn === 'black') return;

    // 回退一步（黑方）
    let state = history.pop();
    // 再回退一步（红方）
    if (history.length > 0) {
        state = history.pop();
    }
    
    board = state.boardSnapshot;
    turn = 'red'; // 强制回退到红方
    lastMove = history.length > 0 ? history[history.length - 1].move : null;
    selectedIndex = -1;
    gameOver = false;
    
    renderBoard();
    updateStatus();
    updateHistoryUI();
}

function updateHistoryUI() {
    historyPanel.innerHTML = '';
    history.forEach((h, i) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const p = h.boardSnapshot[h.move.from]; // 获取移动的棋子 (注意snapshot是移动前的)
        const pName = PIECE_CHARS[p];
        const color = isRed(p) ? "红" : "黑";
        div.textContent = `${i + 1}. ${color}${pName} ${getCoord(h.move.from)} -> ${getCoord(h.move.to)}`;
        historyPanel.appendChild(div);
    });
    historyPanel.scrollTop = historyPanel.scrollHeight;
}

function getCoord(index) {
    const r = Math.floor(index / 9);
    const c = index % 9;
    return `(${r},${c})`;
}

// --- 辅助函数 ---
function isRed(piece) {
    return piece && piece === piece.toUpperCase();
}

function isBlack(piece) {
    return piece && piece === piece.toLowerCase();
}

function getRow(index) { return Math.floor(index / 9); }
function getCol(index) { return index % 9; }
function getIndex(r, c) { return r * 9 + c; }

// --- 核心逻辑：走法生成 ---
function getValidMoves(currentBoard, color) {
    const moves = [];
    for (let i = 0; i < 90; i++) {
        const p = currentBoard[i];
        if (!p) continue;
        
        const isRedPiece = isRed(p);
        if (color === 'red' && !isRedPiece) continue;
        if (color === 'black' && isRedPiece) continue;
        
        const row = getRow(i);
        const col = getCol(i);
        
        switch (p.toLowerCase()) {
            case 'k': generateKingMoves(currentBoard, i, row, col, isRedPiece, moves); break;
            case 'a': generateAdvisorMoves(currentBoard, i, row, col, isRedPiece, moves); break;
            case 'b': generateBishopMoves(currentBoard, i, row, col, isRedPiece, moves); break; // 象
            case 'n': generateKnightMoves(currentBoard, i, row, col, isRedPiece, moves); break;
            case 'r': generateRookMoves(currentBoard, i, row, col, isRedPiece, moves); break;
            case 'c': generateCannonMoves(currentBoard, i, row, col, isRedPiece, moves); break;
            case 'p': generatePawnMoves(currentBoard, i, row, col, isRedPiece, moves); break;
        }
    }
    
    // 过滤掉会导致"将帅照面"或"被将军"的移动 (简单起见，我们主要处理将帅照面，被将军留给AI评估去避免)
    // 实际上，合法的走法生成必须排除掉走完后自己被将军的局面
    const legalMoves = [];
    for (const move of moves) {
        // 模拟走棋
        const captured = currentBoard[move.to];
        currentBoard[move.to] = currentBoard[move.from];
        currentBoard[move.from] = null;
        
        if (!isFlyingGeneral(currentBoard)) {
            legalMoves.push(move);
        }
        
        // 撤销
        currentBoard[move.from] = currentBoard[move.to];
        currentBoard[move.to] = captured;
    }
    
    return legalMoves;
}

function isFlyingGeneral(board) {
    let kingRedIdx = -1;
    let kingBlackIdx = -1;
    
    // 找到两个王的位置
    // 优化：只搜九宫格
    for (let r = 0; r <= 2; r++) {
        for (let c = 3; c <= 5; c++) {
            const idx = getIndex(r, c);
            if (board[idx] === 'k') kingBlackIdx = idx;
        }
    }
    for (let r = 7; r <= 9; r++) {
        for (let c = 3; c <= 5; c++) {
            const idx = getIndex(r, c);
            if (board[idx] === 'K') kingRedIdx = idx;
        }
    }
    
    if (kingRedIdx === -1 || kingBlackIdx === -1) return false; // 王被吃了，不算照面（游戏结束）
    
    const colR = getCol(kingRedIdx);
    const colB = getCol(kingBlackIdx);
    
    if (colR !== colB) return false; // 不在同列
    
    // 检查中间是否有子
    const minR = Math.min(getRow(kingRedIdx), getRow(kingBlackIdx));
    const maxR = Math.max(getRow(kingRedIdx), getRow(kingBlackIdx));
    
    for (let r = minR + 1; r < maxR; r++) {
        if (board[getIndex(r, colR)]) return false; // 有阻隔
    }
    
    return true; // 无阻隔，照面
}

function addMove(moves, from, to, board, isRedTurn) {
    const target = board[to];
    if (target) {
        if (isRedTurn && isRed(target)) return;
        if (!isRedTurn && isBlack(target)) return;
    }
    moves.push({ from, to });
}

function generateKingMoves(board, idx, r, c, isRed, moves) {
    // 帅/将：九宫格内，上下左右
    const dr = [-1, 1, 0, 0];
    const dc = [0, 0, -1, 1];
    
    for (let i = 0; i < 4; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nc < 3 || nc > 5) continue; // 必须在九宫格列
        if (isRed) {
            if (nr < 7 || nr > 9) continue;
        } else {
            if (nr < 0 || nr > 2) continue;
        }
        addMove(moves, idx, getIndex(nr, nc), board, isRed);
    }
}

function generateAdvisorMoves(board, idx, r, c, isRed, moves) {
    // 仕/士：九宫格斜线
    const dr = [-1, -1, 1, 1];
    const dc = [-1, 1, -1, 1];
    
    for (let i = 0; i < 4; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nc < 3 || nc > 5) continue;
        if (isRed) {
            if (nr < 7 || nr > 9) continue;
        } else {
            if (nr < 0 || nr > 2) continue;
        }
        addMove(moves, idx, getIndex(nr, nc), board, isRed);
    }
}

function generateBishopMoves(board, idx, r, c, isRed, moves) {
    // 相/象：田字，不能过河，有塞象眼
    const dr = [-2, -2, 2, 2];
    const dc = [-2, 2, -2, 2];
    const eyeR = [-1, -1, 1, 1]; // 象眼位置
    const eyeC = [-1, 1, -1, 1];
    
    for (let i = 0; i < 4; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        
        if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
        
        // 不能过河
        if (isRed) {
            if (nr < 5) continue;
        } else {
            if (nr > 4) continue;
        }
        
        // 塞象眼
        const er = r + eyeR[i];
        const ec = c + eyeC[i];
        if (board[getIndex(er, ec)]) continue;
        
        addMove(moves, idx, getIndex(nr, nc), board, isRed);
    }
}

function generateKnightMoves(board, idx, r, c, isRed, moves) {
    // 马：日字，有蹩马腿
    const dr = [-2, -1, 1, 2, 2, 1, -1, -2];
    const dc = [1, 2, 2, 1, -1, -2, -2, -1];
    const legR = [-1, 0, 0, 1, 1, 0, 0, -1]; // 马腿位置
    const legC = [0, 1, 1, 0, 0, -1, -1, 0];
    
    for (let i = 0; i < 8; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
        
        // 蹩马腿
        const lr = r + legR[i];
        const lc = c + legC[i];
        if (board[getIndex(lr, lc)]) continue;
        
        addMove(moves, idx, getIndex(nr, nc), board, isRed);
    }
}

function generateRookMoves(board, idx, r, c, isRed, moves) {
    // 车：直线
    const dr = [-1, 1, 0, 0];
    const dc = [0, 0, -1, 1];
    
    for (let i = 0; i < 4; i++) {
        let nr = r + dr[i];
        let nc = c + dc[i];
        while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
            const destIdx = getIndex(nr, nc);
            const p = board[destIdx];
            if (!p) {
                addMove(moves, idx, destIdx, board, isRed);
            } else {
                addMove(moves, idx, destIdx, board, isRed); // 碰到棋子，尝试吃
                break; // 停下
            }
            nr += dr[i];
            nc += dc[i];
        }
    }
}

function generateCannonMoves(board, idx, r, c, isRed, moves) {
    // 炮：直线，隔山打牛
    const dr = [-1, 1, 0, 0];
    const dc = [0, 0, -1, 1];
    
    for (let i = 0; i < 4; i++) {
        let nr = r + dr[i];
        let nc = c + dc[i];
        let platform = false; // 是否已经越过一个平台
        
        while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
            const destIdx = getIndex(nr, nc);
            const p = board[destIdx];
            
            if (!p) {
                if (!platform) {
                    addMove(moves, idx, destIdx, board, isRed); // 没翻山前，走空地
                }
            } else {
                if (!platform) {
                    platform = true; // 碰到第一个子，作为炮架
                } else {
                    addMove(moves, idx, destIdx, board, isRed); // 碰到第二个子，吃
                    break;
                }
            }
            nr += dr[i];
            nc += dc[i];
        }
    }
}

function generatePawnMoves(board, idx, r, c, isRed, moves) {
    // 兵/卒
    const forward = isRed ? -1 : 1;
    
    // 向前一步
    const nr = r + forward;
    if (nr >= 0 && nr <= 9) {
        addMove(moves, idx, getIndex(nr, c), board, isRed);
    }
    
    // 过河后可以横走
    let crossedRiver = false;
    if (isRed && r <= 4) crossedRiver = true;
    if (!isRed && r >= 5) crossedRiver = true;
    
    if (crossedRiver) {
        if (c > 0) addMove(moves, idx, getIndex(r, c - 1), board, isRed);
        if (c < 8) addMove(moves, idx, getIndex(r, c + 1), board, isRed);
    }
}

// --- AI 核心 ---

// 位置估值表 (PST) - 简化版
// 数值越高越好
// 数组映射：0-89
const PST = {
    // 兵 (Red) - 翻转后用于 Black
    'P': [
        0,  0,  0,  0,  0,  0,  0,  0,  0, // 0 (Black baseline)
        0,  0,  0,  0,  0,  0,  0,  0,  0,
        0,  0,  0,  0,  0,  0,  0,  0,  0, // 未过河
        10, 0, 10,  0, 10,  0, 10,  0, 10, // 3 
        10, 0, 10,  0, 10,  0, 10,  0, 10, // 4
        20, 20, 20, 20, 20, 20, 20, 20, 20, // 5 过河
        30, 30, 40, 50, 60, 50, 40, 30, 30, // 6
        40, 40, 50, 60, 70, 60, 50, 40, 40, // 7
        50, 50, 60, 70, 80, 70, 60, 50, 50, // 8
        0,  0,  0,  0,  0,  0,  0,  0,  0  // 9 (Red baseline)
    ].reverse(), // 因为 Red 在下方 (index 81-89)，但我们的 PST 通常定义为上方进攻下方。
                 // 让我们重新定义 PST：以 index 0 为 Top (Black side)
                 // Red P 位于 Bottom，向上走。
                 // Index 0 是 Red 的目标。
                 // 所以上面的数组应该是：index 0 是高分，index 89 是低分。
                 // 默认定义的顺序是从 0..89。
                 // Red P 在 index 0 行得分最高。
                 // 所以上述数组不需要 reverse，直接用即可（0行是黑底，红兵到这很强）。
    
    // 简化处理：我们动态计算 value
};

function getPieceValue(piece, index) {
    const baseVal = PIECE_VALUES[piece];
    let positionVal = 0;
    
    const row = getRow(index);
    const col = getCol(index);
    const isRedPiece = isRed(piece);
    
    // 简单的位置加成
    if (piece.toLowerCase() === 'p') {
        // 兵
        if (isRedPiece) {
            if (row < 5) positionVal += 30; // 过河
            if (row < 2) positionVal += 20; // 逼近九宫
        } else {
            if (row > 4) positionVal += 30;
            if (row > 7) positionVal += 20;
        }
    } else if (piece.toLowerCase() === 'n') {
        // 马：喜欢中间
        if (col > 2 && col < 6) positionVal += 10;
        if (!isRedPiece && row > 4) positionVal += 10; // 进攻
        if (isRedPiece && row < 5) positionVal += 10;
    } else if (piece.toLowerCase() === 'c') {
        // 炮：中炮强
        if (col === 4) positionVal += 10;
    }
    
    return baseVal + positionVal;
}

function evaluate(board) {
    let score = 0;
    for (let i = 0; i < 90; i++) {
        const p = board[i];
        if (p) {
            const val = getPieceValue(p, i);
            if (isRed(p)) score += val; // 红方正分
            else score -= val;          // 黑方负分
        }
    }
    return score;
}

// Alpha-Beta 搜索
function alphaBeta(board, depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0) {
        return evaluate(board);
    }
    
    // 检查游戏结束（王被吃）
    // 简单检查：看是否有 king missing (这个 check 比较耗时，通常在 move generate 后如果捕捉了王就返回极值)
    // 这里我们假设 depth 0 的 evaluate 不包含胜负判断，胜负在 move generation 的 capture 里面判断
    
    const color = isMaximizingPlayer ? 'red' : 'black';
    const moves = getValidMoves(board, color);
    
    // 排序 moves 提高剪枝效率 (Capture moves first)
    moves.sort((a, b) => {
        const pA = board[a.to] ? PIECE_VALUES[board[a.to]] : 0;
        const pB = board[b.to] ? PIECE_VALUES[board[b.to]] : 0;
        return pB - pA;
    });

    if (moves.length === 0) {
        // 无棋可走，输了
        return isMaximizingPlayer ? -20000 : 20000;
    }

    if (isMaximizingPlayer) { // Red
        let maxEval = -Infinity;
        for (const move of moves) {
            const captured = board[move.to];
            if (captured && captured === 'k') return 100000; // 直接赢

            // Make move
            board[move.to] = board[move.from];
            board[move.from] = null;
            
            const eval = alphaBeta(board, depth - 1, alpha, beta, false);
            
            // Undo move
            board[move.from] = board[move.to];
            board[move.to] = captured;
            
            maxEval = Math.max(maxEval, eval);
            alpha = Math.max(alpha, eval);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else { // Black (AI)
        let minEval = Infinity;
        for (const move of moves) {
            const captured = board[move.to];
            if (captured && captured === 'K') return -100000; // 直接赢

            // Make move
            board[move.to] = board[move.from];
            board[move.from] = null;
            
            const eval = alphaBeta(board, depth - 1, alpha, beta, true);
            
            // Undo move
            board[move.from] = board[move.to];
            board[move.to] = captured;
            
            minEval = Math.min(minEval, eval);
            beta = Math.min(beta, eval);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function makeAiMove() {
    // 简单起见，不使用 Worker，直接计算（会卡顿一下 UI，但 depth=4 还可以接受）
    // 真正的“大师”通常需要 WebWorker
    
    const startTime = Date.now();
    let bestMove = null;
    let bestValue = Infinity; // Black wants to minimize score
    
    // 根节点搜索
    const moves = getValidMoves(board, 'black');
    
    // 排序
    moves.sort((a, b) => {
        const pA = board[a.to] ? (PIECE_VALUES[board[a.to]] || 0) : 0;
        const pB = board[b.to] ? (PIECE_VALUES[board[b.to]] || 0) : 0;
        return pB - pA;
    });
    
    // 迭代加深（简化版：直接搜固定深度）
    // 如果是开局，随机性稍微增加一点
    
    let alpha = -Infinity;
    let beta = Infinity;
    
    for (const move of moves) {
        const captured = board[move.to];
        
        // 如果能吃帅，直接走
        if (captured === 'K') {
            bestMove = move;
            break;
        }

        // Make move
        board[move.to] = board[move.from];
        board[move.from] = null;
        
        // 搜索 Red 的回应 (Maximizing)
        const eval = alphaBeta(board, searchDepth - 1, alpha, beta, true);
        
        // Undo
        board[move.from] = board[move.to];
        board[move.to] = captured;
        
        if (eval < bestValue) {
            bestValue = eval;
            bestMove = move;
        }
        beta = Math.min(beta, eval);
    }
    
    const endTime = Date.now();
    console.log(`AI thinking time: ${endTime - startTime}ms, Eval: ${bestValue}`);
    
    if (bestMove) {
        makeMove(bestMove);
    } else {
        alert("AI 无路可走，你赢了！");
        gameOver = true;
    }
}

// 启动
initGame();
