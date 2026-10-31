#include "esugoroku.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

static void board_reset(EsrBoard *board, EsrStyle style, uint8_t count,
                        uint8_t start, uint8_t goal, bool bounce,
                        bool branch_by_parity, uint8_t required_tokens)
{
    memset(board, 0, sizeof(*board));
    board->style = (uint8_t)style;
    board->node_count = count;
    board->start_node = start;
    board->goal_node = goal;
    board->bounce_back = bounce;
    board->branch_on_parity = branch_by_parity;
    board->required_tokens = required_tokens;

    for (int i = 0; i < ESR_MAX_NODES; ++i) {
        board->nodes[i].next[0] = ESR_NO_EDGE;
        board->nodes[i].next[1] = ESR_NO_EDGE;
        board->nodes[i].prev = ESR_NO_EDGE;
        board->nodes[i].next_count = 0;
        board->nodes[i].kind = ESR_NODE_NORMAL;
    }
}

static void chain_nodes(EsrBoard *board, uint8_t count)
{
    for (uint8_t i = 0; i + 1u < count; ++i) {
        board->nodes[i].next[0] = (int16_t)(i + 1u);
        board->nodes[i].next_count = 1;
        board->nodes[i + 1u].prev = (int16_t)i;
    }
    board->nodes[count - 1u].next_count = 0;
    board->nodes[count - 1u].next[0] = ESR_NO_EDGE;
}

static void set_jump_all(EsrBoard *board, uint8_t node, int8_t delta)
{
    for (int i = 0; i < 6; ++i) {
        board->nodes[node].jump_table[i] = delta;
    }
}

static void set_jump_table(EsrBoard *board, uint8_t node,
                           const int8_t table[6])
{
    for (int i = 0; i < 6; ++i) {
        board->nodes[node].jump_table[i] = table[i];
    }
}

void esr_board_init(EsrBoard *board, EsrStyle style)
{
    if (!board) {
        return;
    }

    switch (style) {
    case ESR_STYLE_MAWARI: {
        board_reset(board, style, 17, 0, 16, true, false, 0);
        chain_nodes(board, 17);
        board->nodes[2].jump_table[0] = 2;
        board->nodes[2].jump_table[1] = 2;
        board->nodes[2].jump_table[2] = 2;
        board->nodes[2].jump_table[3] = 2;
        board->nodes[2].jump_table[4] = 2;
        board->nodes[2].jump_table[5] = 2;
        set_jump_all(board, 7, 2);
        set_jump_all(board, 12, 3);
        board->nodes[4].kind = ESR_NODE_STAY;
        board->nodes[4].stay_turns = 1;
        board->nodes[9].kind = ESR_NODE_STAY;
        board->nodes[9].stay_turns = 1;
        board->nodes[16].kind = ESR_NODE_GOAL;
        break;
    }
    case ESR_STYLE_TOBI: {
        static const int8_t t4[6] = {3, 3, 3, 1, 1, -3};
        static const int8_t t7[6] = {-2, -2, 2, 2, 2, 0};
        static const int8_t t10[6] = {2, 2, 2, 2, 2, 4};
        static const int8_t t13[6] = {-3, -3, -3, 1, 1, 3};
        board_reset(board, style, 17, 0, 16, false, false, 0);
        chain_nodes(board, 17);
        set_jump_table(board, 4, t4);
        set_jump_table(board, 7, t7);
        set_jump_table(board, 10, t10);
        set_jump_table(board, 13, t13);
        board->nodes[16].kind = ESR_NODE_GOAL;
        break;
    }
    case ESR_STYLE_KESSHU: {
        board_reset(board, style, 18, 0, 17, false, false, 2);
        chain_nodes(board, 18);
        board->nodes[3].kind = ESR_NODE_TOKEN;
        board->nodes[3].tokens = 1u << 0;
        board->nodes[9].kind = ESR_NODE_TOKEN;
        board->nodes[9].tokens = 1u << 1;
        board->nodes[17].kind = ESR_NODE_GOAL;
        break;
    }
    case ESR_STYLE_WAKARE: {
        board_reset(board, style, 19, 0, 18, false, true, 0);
        chain_nodes(board, 12);
        board->nodes[11].kind = ESR_NODE_BRANCH;
        board->nodes[11].next[0] = 12;
        board->nodes[11].next[1] = 15;
        board->nodes[11].next_count = 2;

        board->nodes[12].next[0] = 13;
        board->nodes[12].next_count = 1;
        board->nodes[12].prev = 11;
        board->nodes[12].kind = ESR_NODE_GOOD;
        set_jump_all(board, 12, 2);

        board->nodes[13].next[0] = 14;
        board->nodes[13].next_count = 1;
        board->nodes[13].prev = 12;
        board->nodes[13].kind = ESR_NODE_GOOD;
        set_jump_all(board, 13, 1);

        board->nodes[14].next[0] = 18;
        board->nodes[14].next_count = 1;
        board->nodes[14].prev = 13;
        board->nodes[14].kind = ESR_NODE_GOOD;

        board->nodes[15].next[0] = 16;
        board->nodes[15].next_count = 1;
        board->nodes[15].prev = 11;
        board->nodes[15].kind = ESR_NODE_EVIL;
        board->nodes[15].stay_turns = 2;

        board->nodes[16].next[0] = 17;
        board->nodes[16].next_count = 1;
        board->nodes[16].prev = 15;
        board->nodes[16].kind = ESR_NODE_EVIL;

        board->nodes[17].next[0] = 18;
        board->nodes[17].next_count = 1;
        board->nodes[17].prev = 16;
        board->nodes[17].kind = ESR_NODE_EVIL;
        set_jump_all(board, 17, -2);

        board->nodes[18].kind = ESR_NODE_GOAL;
        board->nodes[18].next_count = 0;
        board->nodes[18].next[0] = ESR_NO_EDGE;
        break;
    }
    default:
        board_reset(board, ESR_STYLE_MAWARI, 17, 0, 16, true, false, 0);
        chain_nodes(board, 17);
        board->nodes[16].kind = ESR_NODE_GOAL;
        break;
    }
}

void esr_match_init(EsrMatch *match, const EsrBoard *board,
                    uint8_t charms_player0, uint8_t charms_player1,
                    uint8_t first_player)
{
    if (!match || !board) {
        return;
    }
    memset(match, 0, sizeof(*match));
    match->pos[0] = board->start_node;
    match->pos[1] = board->start_node;
    match->charms[0] = charms_player0;
    match->charms[1] = charms_player1;
    match->turn = (uint8_t)(first_player & 1u);
    match->winner = -1;
}

static void push_event(EsrEventLog *log, EsrEventType type, int player,
                       int from, int to, int roll, int value)
{
    if (!log || log->count >= ESR_MAX_EVENTS) {
        return;
    }
    EsrEvent *ev = &log->items[log->count++];
    ev->type = type;
    ev->player = player;
    ev->from = from;
    ev->to = to;
    ev->roll = roll;
    ev->value = value;
}

static int clamp_node(const EsrBoard *board, int node)
{
    if (node < 0) {
        return board->start_node;
    }
    if (node >= board->node_count) {
        return board->goal_node;
    }
    return node;
}

static bool has_charm(const EsrMatch *match, int player, uint8_t charm)
{
    return (match->charms[player] & charm) != 0u &&
           (match->charm_used[player] & charm) == 0u;
}

static void consume_charm(EsrMatch *match, int player, uint8_t charm)
{
    match->charm_used[player] |= charm;
}

int esr_apply_roll(const EsrBoard *board, EsrMatch *match, int roll,
                   EsrEventLog *log)
{
    if (!board || !match || roll < 1 || roll > 6 || match->winner >= 0) {
        return 0;
    }

    if (log) {
        log->count = 0;
    }

    const int player = match->turn;
    const int opponent = 1 - player;

    if (match->skip[player] > 0u) {
        match->skip[player]--;
        push_event(log, ESR_EV_SKIP, player, match->pos[player],
                   match->pos[player], roll, match->skip[player]);
        match->turn = (uint8_t)opponent;
        match->turn_count++;
        return 0;
    }

    int steps = roll;
    if (has_charm(match, player, ESR_CHARM_DASH)) {
        steps += 1;
        consume_charm(match, player, ESR_CHARM_DASH);
        push_event(log, ESR_EV_CHARM, player, match->pos[player],
                   match->pos[player], roll, ESR_CHARM_DASH);
    }

    int pos = match->pos[player];
    const int start_pos = pos;
    bool bounced = false;
    bool branch_seen = false;
    bool branch_good = (roll % 2) == 0;
    int direction = 1;

    for (int step = 0; step < steps; ++step) {
        if (direction < 0) {
            const int prev = board->nodes[pos].prev;
            if (prev == ESR_NO_EDGE) {
                break;
            }
            pos = prev;
            continue;
        }

        if (pos == (int)board->goal_node) {
            if (!board->bounce_back) {
                break;
            }
            const int prev = board->nodes[pos].prev;
            if (prev == ESR_NO_EDGE) {
                break;
            }
            direction = -1;
            pos = prev;
            if (!bounced) {
                bounced = true;
                push_event(log, ESR_EV_BOUNCE, player, board->goal_node,
                           pos, roll, steps - step);
            }
            continue;
        }

        const EsrNode *node = &board->nodes[pos];
        int edge = 0;
        if (node->next_count == 0u) {
            break;
        }
        if (node->next_count > 1u) {
            if (board->branch_on_parity) {
                edge = branch_good ? 0 : 1;
                if (!branch_seen) {
                    branch_seen = true;
                    push_event(log, branch_good ? ESR_EV_BRANCH_GOOD
                                                : ESR_EV_BRANCH_EVIL,
                               player, pos, node->next[edge], roll, edge);
                }
            } else {
                edge = 0;
            }
        }
        pos = node->next[edge];
        if (pos < 0 || pos >= (int)board->node_count) {
            pos = board->goal_node;
            break;
        }
    }

    match->pos[player] = (int16_t)pos;
    push_event(log, ESR_EV_MOVE, player, start_pos, pos, roll, steps);

    /* A tobi landing consults the printed 1..6 short-strip table once. */
    if (pos != (int)board->goal_node) {
        int8_t jump = board->nodes[pos].jump_table[roll - 1];
        if (jump != 0) {
            bool cancelled = false;
            if (jump < 0 && has_charm(match, player, ESR_CHARM_GUARD)) {
                consume_charm(match, player, ESR_CHARM_GUARD);
                cancelled = true;
                push_event(log, ESR_EV_CHARM, player, pos, pos, roll,
                           ESR_CHARM_GUARD);
            }
            if (!cancelled) {
                int from = pos;
                pos = clamp_node(board, pos + jump);
                match->pos[player] = (int16_t)pos;
                push_event(log, ESR_EV_JUMP, player, from, pos, roll, jump);
            }
        }
    }

    /* Resolve the final landing square, including tokens and 泊 stays. */
    if (pos == (int)board->goal_node) {
        if ((uint8_t)(match->tokens[player] & 0xFFu) >=
            board->required_tokens) {
            match->winner = (int8_t)player;
            push_event(log, ESR_EV_WIN, player, pos, pos, roll, 0);
            match->turn_count++;
            return 1;
        }
        int prev = board->nodes[pos].prev;
        if (prev == ESR_NO_EDGE) {
            prev = board->start_node;
        }
        match->pos[player] = (int16_t)prev;
        pos = prev;
        push_event(log, ESR_EV_GOAL_LOCKED, player, board->goal_node, pos,
                   roll, board->required_tokens);
    }

    const EsrNode *land = &board->nodes[pos];
    if (land->tokens != 0u) {
        match->tokens[player] |= land->tokens;
        push_event(log, ESR_EV_TOKEN, player, pos, pos, roll, land->tokens);
    }

    if (land->stay_turns > 0u) {
        if (has_charm(match, player, ESR_CHARM_STAY)) {
            consume_charm(match, player, ESR_CHARM_STAY);
            push_event(log, ESR_EV_CHARM, player, pos, pos, roll,
                       ESR_CHARM_STAY);
        } else {
            match->skip[player] =
                (uint8_t)(match->skip[player] + land->stay_turns);
            push_event(log, ESR_EV_STAY, player, pos, pos, roll,
                       land->stay_turns);
        }
    }

    /* Kesshu boards resolve a same-square warrior encounter immediately. */
    if (board->style == ESR_STYLE_KESSHU &&
        match->pos[opponent] == match->pos[player] &&
        match->pos[player] != (int)board->start_node) {
        int pushed = board->nodes[match->pos[opponent]].prev;
        if (pushed == ESR_NO_EDGE) {
            pushed = board->start_node;
        }
        match->pos[opponent] = (int16_t)pushed;
        push_event(log, ESR_EV_DUEL, player, pos, pushed, roll, opponent);
    }

    match->turn = (uint8_t)opponent;
    match->turn_count++;
    return 0;
}

static double position_score(const EsrBoard *board, int pos, uint8_t tokens,
                             uint8_t skip)
{
    const double span = board->goal_node > 0 ? (double)board->goal_node : 1.0;
    double score = 100.0 * (1.0 - (double)pos / span);
    score += (double)tokens * 8.0;
    score -= (double)skip * 7.0;
    return score;
}

double esr_ai_expected_value(const EsrBoard *board, const EsrMatch *match,
                             int player)
{
    if (!board || !match || player < 0 || player > 1) {
        return 0.0;
    }
    if (match->winner == player) {
        return 1000.0;
    }
    if (match->winner >= 0) {
        return -1000.0;
    }

    double total = 0.0;
    for (int roll = 1; roll <= 6; ++roll) {
        EsrMatch trial = *match;
        trial.turn = (uint8_t)player;
        EsrEventLog log;
        log.count = 0;
        (void)esr_apply_roll(board, &trial, roll, &log);
        if (trial.winner == player) {
            total += 1000.0;
        } else if (trial.winner >= 0) {
            total -= 1000.0;
        } else {
            total += position_score(board, trial.pos[player],
                                    trial.tokens[player], trial.skip[player]);
        }
    }
    return total / 6.0;
}

bool esr_board_is_connected(const EsrBoard *board)
{
    if (!board || board->node_count == 0u ||
        board->node_count > ESR_MAX_NODES) {
        return false;
    }

    bool seen[ESR_MAX_NODES] = {false};
    int queue[ESR_MAX_NODES];
    int head = 0;
    int tail = 0;
    queue[tail++] = board->start_node;
    seen[board->start_node] = true;

    while (head < tail) {
        int cur = queue[head++];
        const EsrNode *node = &board->nodes[cur];
        for (uint8_t e = 0; e < node->next_count; ++e) {
            int nxt = node->next[e];
            if (nxt >= 0 && nxt < (int)board->node_count && !seen[nxt]) {
                seen[nxt] = true;
                queue[tail++] = nxt;
            }
        }
    }

    for (uint8_t i = 0; i < board->node_count; ++i) {
        if (!seen[i]) {
            return false;
        }
    }
    return seen[board->goal_node];
}

const char *esr_style_name(EsrStyle style)
{
    switch (style) {
    case ESR_STYLE_MAWARI:
        return "mawari";
    case ESR_STYLE_TOBI:
        return "tobi";
    case ESR_STYLE_KESSHU:
        return "kesshu";
    case ESR_STYLE_WAKARE:
        return "wakare";
    default:
        return "unknown";
    }
}
