#ifndef ESUGOROKU_H
#define ESUGOROKU_H

/*
 * 江戸浮世絵・絵双六 (E-Sugoroku) -- C11 reference rules engine.
 *
 * The JS engine in mobile/js/core.js mirrors this file's semantics:
 *   * a directed graph board (node -> next[0] / next[1]),
 *   * exact-finish bounce-back for the Tokaido mawari board,
 *   * one jump_table[6] lookup per landing for the monster tobi board,
 *   * stay_turns ("tomari") and collectible token masks,
 *   * good/evil branch selection by dice parity for the Genji board,
 *   * three pocket charms that modify stay / backward-jump / first-roll rules,
 *   * a small expectimax-style expected-value evaluator used by the AI.
 */

#include <stdbool.h>
#include <stdint.h>

#define ESR_MAX_NODES 40
#define ESR_MAX_EVENTS 20
#define ESR_NO_EDGE (-1)

typedef enum {
    ESR_STYLE_MAWARI = 0, /* 廻り双六: 東海道名物道中 */
    ESR_STYLE_TOBI = 1,   /* 飛び双六: 百種怪談妖物 */
    ESR_STYLE_KESSHU = 2, /* 集結双六: 誠忠義士 */
    ESR_STYLE_WAKARE = 3  /* 振り分け双六: 源氏絵合 */
} EsrStyle;

typedef enum {
    ESR_NODE_NORMAL = 0,
    ESR_NODE_STAY = 1,
    ESR_NODE_TOKEN = 2,
    ESR_NODE_GOOD = 3,
    ESR_NODE_EVIL = 4,
    ESR_NODE_GOAL = 5,
    ESR_NODE_BRANCH = 6
} EsrNodeKind;

typedef enum {
    ESR_CHARM_NONE = 0,
    ESR_CHARM_STAY = 1u << 0,  /* 宿場守り: cancel one 泊 */
    ESR_CHARM_GUARD = 1u << 1, /* 妖怪封じ: cancel one backward jump */
    ESR_CHARM_DASH = 1u << 2   /* 早駕籠: +1 to the first roll */
} EsrCharm;

typedef enum {
    ESR_EV_MOVE = 0,
    ESR_EV_JUMP,
    ESR_EV_STAY,
    ESR_EV_TOKEN,
    ESR_EV_DUEL,
    ESR_EV_BOUNCE,
    ESR_EV_GOAL_LOCKED,
    ESR_EV_WIN,
    ESR_EV_SKIP,
    ESR_EV_CHARM,
    ESR_EV_BRANCH_GOOD,
    ESR_EV_BRANCH_EVIL
} EsrEventType;

typedef struct {
    int16_t next[2];
    int16_t prev;
    uint8_t next_count;
    /*
     * Relative jump for a landed roll 1..6.  0 means "no jump".
     * A negative value is a penalty and can be cancelled by ESR_CHARM_GUARD.
     */
    int8_t jump_table[6];
    uint8_t stay_turns;
    uint8_t tokens; /* bit mask granted on landing */
    uint8_t kind;   /* EsrNodeKind */
} EsrNode;

typedef struct {
    uint8_t style; /* EsrStyle */
    uint8_t node_count;
    uint8_t start_node;
    uint8_t goal_node;
    uint8_t required_tokens;
    bool bounce_back;
    bool branch_on_parity;
    EsrNode nodes[ESR_MAX_NODES];
} EsrBoard;

typedef struct {
    int16_t pos[2];
    uint8_t tokens[2];
    uint8_t skip[2];
    uint8_t charms[2];     /* EsrCharm bit mask per player */
    uint8_t charm_used[2]; /* consumed charm bits */
    uint8_t turn;          /* 0 = black / 先手, 1 = white / 後手 */
    int8_t winner;         /* -1 while playing */
    uint8_t turn_count;
} EsrMatch;

typedef struct {
    EsrEventType type;
    int player;
    int from;
    int to;
    int roll;
    int value;
} EsrEvent;

typedef struct {
    EsrEvent items[ESR_MAX_EVENTS];
    int count;
} EsrEventLog;

/* Build one of the four canonical phase-1 boards. */
void esr_board_init(EsrBoard *board, EsrStyle style);

/* Reset a match on a previously built board. */
void esr_match_init(EsrMatch *match, const EsrBoard *board,
                    uint8_t charms_player0, uint8_t charms_player1,
                    uint8_t first_player);

/*
 * Apply one six-sided die result.  The function is deterministic and mutates
 * only `match`; all rule consequences are appended to `log` when non-NULL.
 * Returns 1 when this roll produced a winner, 0 otherwise.
 */
int esr_apply_roll(const EsrBoard *board, EsrMatch *match, int roll,
                   EsrEventLog *log);

/* 0..6 expected-value sweep for the player to move (or `player` if forced). */
double esr_ai_expected_value(const EsrBoard *board, const EsrMatch *match,
                             int player);

/* Graph connectivity / goal / token sanity check used by tests. */
bool esr_board_is_connected(const EsrBoard *board);

const char *esr_style_name(EsrStyle style);

#endif /* ESUGOROKU_H */
