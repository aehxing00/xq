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
    'k': 10000, 'a': 250, 'b': 250, 'n': 400, 'r': 1000, 'c': 450, 'p': 100,
    'K': 10000, 'A': 250, 'B': 250, 'N': 400, 'R': 1000, 'C': 450, 'P': 100
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
let searchDepth = 4; // AI 搜索深度
let isAiThinking = false;
let isAnimating = false;

// AI 全局变量
let zobristTable = [];
let turnHash = 0n;
let tt = new Map();
const TT_SIZE_LIMIT = 1000000;

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
    isAiThinking = false;
    searchDepth = parseInt(difficultySelect.value);
    
    // 初始化 Zobrist
    initZobrist();
    tt.clear();
    
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
            pieceEl.id = `piece-${i}`; // 给每个棋子唯一ID，方便动画定位（虽然重绘会销毁）
            
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
        if (selectedIndex !== -1 && !gameOver && turn === 'red') {
            const possibleMoves = getValidMoves(board, turn);
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
        if (!isAiThinking) {
            isAiThinking = true;
            aiStatus.textContent = "AI 正在计算...";
            
            // 使用 setTimeout 让 UI 有机会渲染“AI 正在计算”
            // 避免主线程直接阻塞导致文字不更新
            setTimeout(() => {
                runAiMove();
            }, 100);
        }
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
    if (gameOver || turn === 'black' || isAiThinking || isAnimating) return;

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
        }
    }
}

function makeMove(move) {
    // 记录历史
    const captured = board[move.to];
    history.push({
        move: move,
        captured: captured,
        boardSnapshot: [...board],
        turn: turn
    });

    // 动画逻辑
    const fromCell = boardEl.children[move.from];
    const toCell = boardEl.children[move.to];
    const p = board[move.from];

    if (fromCell && toCell && p) {
        isAnimating = true;
        const startRect = fromCell.getBoundingClientRect();
        const endRect = toCell.getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();
        
        // 创建飞行棋子
        const flyer = document.createElement('div');
        flyer.className = `piece ${isRed(p) ? 'red' : 'black'} piece-moving`;
        flyer.textContent = PIECE_CHARS[p];
        
        // 计算初始位置 (相对于 boardEl)
        // .piece 默认有 left: 3px, top: 3px
        const startLeft = startRect.left - boardRect.left + 3;
        const startTop = startRect.top - boardRect.top + 3;
        
        flyer.style.left = `${startLeft}px`;
        flyer.style.top = `${startTop}px`;
        
        boardEl.appendChild(flyer);
        
        // 隐藏原始棋子
        const originalPiece = fromCell.querySelector('.piece');
        if (originalPiece) originalPiece.style.opacity = '0';
        
        // 强制回流
        flyer.getBoundingClientRect();
        
        // 计算位移并应用 transform
        const dx = (endRect.left - boardRect.left + 3) - startLeft;
        const dy = (endRect.top - boardRect.top + 3) - startTop;
        
        flyer.style.transform = `translate(${dx}px, ${dy}px)`;
        
        playSound();
        
        // 动画结束后更新状态
        setTimeout(() => {
            flyer.remove();
            finishMove(move, captured);
            isAnimating = false;
        }, 300);
    } else {
        // Fallback
        finishMove(move, captured);
        isAnimating = false;
    }
}

function finishMove(move, captured) {
    // 执行移动
    board[move.to] = board[move.from];
    board[move.from] = null;
    lastMove = move;
    selectedIndex = -1;
    
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
    if (isAiThinking) return;

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

// --- AI 核心代码 (主线程版) ---

// 初始化 Zobrist
function initZobrist() {
    for (let i = 0; i < 90; i++) {
        zobristTable[i] = {};
        const pieces = ['k','a','b','n','r','c','p','K','A','B','N','R','C','P'];
        for (let p of pieces) {
            // 生成 64位 随机整数 (模拟)
            zobristTable[i][p] = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
        }
    }
    turnHash = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

// 计算当前局面的 Hash
function computeHash(currentBoard, currentTurn) {
    let h = 0n;
    for (let i = 0; i < 90; i++) {
        const p = currentBoard[i];
        if (p) {
            h ^= zobristTable[i][p];
        }
    }
    if (currentTurn === 'black') h ^= turnHash;
    return h;
}

// 执行 AI 移动
function runAiMove() {
    const result = iterativeDeepening(board, searchDepth, 'black');
    isAiThinking = false;
    
    if (result && result.move) {
        console.log(`AI Move: Depth ${result.depth}, Score ${result.score}`);
        makeMove(result.move);
    } else {
        alert("AI 认输！你赢了！");
        gameOver = true;
        updateStatus();
    }
}

// 迭代加深
function iterativeDeepening(currentBoard, maxDepth, currentTurn) {
    let bestMove = null;
    let currentHash = computeHash(currentBoard, currentTurn);
    
    const startTime = Date.now();
    const timeLimit = 5000; // 5秒限制
    
    for (let d = 1; d <= maxDepth; d++) {
        const result = alphaBeta(currentBoard, d, -Infinity, Infinity, true, currentTurn, currentHash);
        
        if (Date.now() - startTime > timeLimit && d > 2) {
            break; // 超时
        }
        
        if (Math.abs(result.score) > 9000) {
            bestMove = result;
            bestMove.depth = d;
            break;
        }
        
        bestMove = result;
        bestMove.depth = d;
        
        // 更新 UI 状态（虽然在主线程可能卡住看不见，但逻辑上是需要的）
        aiStatus.textContent = `AI 思考中 (深度 ${d}, 分数 ${result.score})...`;
    }
    
    return bestMove;
}

// Alpha-Beta with TT
function alphaBeta(currentBoard, depth, alpha, beta, isMaximizing, currentTurn, hash) {
    const alphaOrig = alpha;

    // 1. 查询 TT
    const ttEntry = tt.get(hash);
    if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === 0) return { score: ttEntry.score, move: ttEntry.bestMove };
        if (ttEntry.flag === 1) alpha = Math.max(alpha, ttEntry.score);
        else if (ttEntry.flag === 2) beta = Math.min(beta, ttEntry.score);
        
        if (alpha >= beta) return { score: ttEntry.score, move: ttEntry.bestMove };
    }

    // 终止条件
    if (depth === 0) {
        return { score: evaluate(currentBoard, currentTurn), move: null };
    }

    const moves = getValidMoves(currentBoard, currentTurn);
    
    // 3. 游戏结束检测
    if (moves.length === 0) {
        return { score: -20000 + (100 - depth), move: null };
    }

    // 4. 走法排序 (MVV-LVA)
    moves.sort((a, b) => {
        const valA = currentBoard[a.to] ? PIECE_VALUES[currentBoard[a.to]] : 0;
        const valB = currentBoard[b.to] ? PIECE_VALUES[currentBoard[b.to]] : 0;
        return valB - valA;
    });

    let bestMove = null;
    let value = -Infinity;

    for (const move of moves) {
        const captured = currentBoard[move.to];
        
        // 更新 Hash
        let newHash = hash;
        newHash ^= zobristTable[move.from][currentBoard[move.from]]; 
        if (captured) newHash ^= zobristTable[move.to][captured];
        newHash ^= zobristTable[move.to][currentBoard[move.from]];
        newHash ^= turnHash;

        // Make move
        currentBoard[move.to] = currentBoard[move.from];
        currentBoard[move.from] = null;
        
        const nextTurn = currentTurn === 'red' ? 'black' : 'red';
        
        // 递归
        const result = alphaBeta(currentBoard, depth - 1, -beta, -alpha, !isMaximizing, nextTurn, newHash);
        const score = -result.score;
        
        // Undo move
        currentBoard[move.from] = currentBoard[move.to];
        currentBoard[move.to] = captured;
        
        if (score > value) {
            value = score;
            bestMove = move;
        }
        
        alpha = Math.max(alpha, value);
        if (alpha >= beta) {
            break; // Beta Cutoff
        }
    }
    
    // 5. 存储 TT
    const flag = value <= alphaOrig ? 2 : (value >= beta ? 1 : 0);
    tt.set(hash, { depth, score: value, flag, bestMove });
    
    return { score: value, move: bestMove };
}

// 评估函数
function evaluate(currentBoard, currentTurn) {
    let redScore = 0;
    let blackScore = 0;
    
    for (let i = 0; i < 90; i++) {
        const p = currentBoard[i];
        if (!p) continue;
        
        const val = getPieceValue(p, i, currentBoard);
        if (isRed(p)) redScore += val;
        else blackScore += val;
    }
    
    return currentTurn === 'red' ? (redScore - blackScore) : (blackScore - redScore);
}

function getPieceValue(piece, index, currentBoard) {
    const baseVal = PIECE_VALUES[piece];
    const row = Math.floor(index / 9);
    const col = index % 9;
    const isRedPiece = isRed(piece);
    let posVal = 0;

    const type = piece.toLowerCase();
    
    if (type === 'p') { // 兵
        if (isRedPiece) {
            if (row < 5) posVal += 30;
            if (row < 2) posVal += 20;
            if (row < 5 && (col === 3 || col === 5)) posVal += 20;
        } else {
            if (row > 4) posVal += 30;
            if (row > 7) posVal += 20;
            if (row > 4 && (col === 3 || col === 5)) posVal += 20;
        }
    } else if (type === 'n') { // 马
        if (col > 2 && col < 6) posVal += 15;
        if (isRedPiece && index === 85) posVal -= 50; 
        if (!isRedPiece && index === 4) posVal -= 50;
    } else if (type === 'c') { // 炮
        if (col === 4) posVal += 20;
    } else if (type === 'r') { // 车
        if (col === 4) posVal += 10;
        if (isRedPiece && row < 2) posVal += 20;
        if (!isRedPiece && row > 7) posVal += 20;
    }
    
    return baseVal + posVal;
}

// 启动游戏
initGame();
