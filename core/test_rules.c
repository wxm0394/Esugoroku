#include "esugoroku.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

static int checks = 0;
static int failures = 0;

#define CHECK(condition, message)                                            \
    do {                                                                     \
        checks++;                                                            \
        if (!(condition)) {                                                  \
            failures++;                                                      \
            fprintf(stderr, "  FAIL %s:%d: %s\n", __FILE__, __LINE__,        \
                    (message));                                              \
        }                                                                    \
    } while (0)

static EsrBoard make_board(EsrStyle style)
{
    EsrBoard board;
    esr_board_init(&board, style);
    return board;
}

static EsrMatch make_match(const EsrBoard *board, uint8_t c0, uint8_t c1)
{
    EsrMatch match;
    esr_match_init(&match, board, c0, c1, 0);
    return match;
}

static int event_count(const EsrEventLog *log, EsrEventType type)
{
    int count = 0;
    for (int i = 0; i < log->count; ++i) {
        if (log->items[i].type == type) {
            count++;
        }
    }
    return count;
}

static void test_board_construction(void)
{
    for (int style = ESR_STYLE_MAWARI; style <= ESR_STYLE_WAKARE; ++style) {
        EsrBoard board = make_board((EsrStyle)style);
        CHECK(board.node_count > 0, "board must contain nodes");
        CHECK(board.goal_node < board.node_count, "goal must be valid");
        CHECK(esr_board_is_connected(&board),
              "every board graph must be connected to its goal");
        CHECK(strcmp(esr_style_name((EsrStyle)style), "unknown") != 0,
              "style must have a name");
    }

    EsrBoard mawari = make_board(ESR_STYLE_MAWARI);
    CHECK(mawari.node_count == 17, "mawari must have 16 ring squares + goal");
    CHECK(mawari.bounce_back, "mawari must use exact-finish bounce back");
    CHECK(mawari.nodes[4].stay_turns == 1, "mawari tomari at node 4");
    CHECK(mawari.nodes[9].stay_turns == 1, "mawari tomari at node 9");

    EsrBoard kesshu = make_board(ESR_STYLE_KESSHU);
    CHECK(kesshu.required_tokens == 2, "kesshu needs two warrior tokens");
    CHECK(kesshu.nodes[3].tokens == 1u, "kesshu first token node");
    CHECK(kesshu.nodes[9].tokens == 2u, "kesshu second token node");
}

static void test_mawari_movement_and_stay(void)
{
    EsrBoard board = make_board(ESR_STYLE_MAWARI);
    EsrMatch match = make_match(&board, 0, 0);
    EsrEventLog log;
    int won;

    won = esr_apply_roll(&board, &match, 3, &log);
    CHECK(won == 0, "early move must not win");
    CHECK(match.pos[0] == 3, "black advances three ring squares");
    CHECK(match.turn == 1, "turn passes to white");

    match.pos[0] = 3;
    match.turn = 0;
    won = esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 4, "black reaches tomari node");
    CHECK(match.skip[0] == 1, "tomari sets one skipped turn");
    CHECK(event_count(&log, ESR_EV_STAY) == 1, "stay event emitted");

    match.turn = 0;
    won = esr_apply_roll(&board, &match, 6, &log);
    CHECK(match.turn == 1, "skip consumes the turn and passes the dice");
    CHECK(match.skip[0] == 0, "skip counter is consumed");
    CHECK(match.pos[0] == 4, "skipped player does not move");
    CHECK(event_count(&log, ESR_EV_SKIP) == 1, "skip event emitted");
    (void)won;
}

static void test_mawari_food_jump(void)
{
    EsrBoard board = make_board(ESR_STYLE_MAWARI);
    EsrMatch match = make_match(&board, 0, 0);
    EsrEventLog log;
    match.pos[0] = 1;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 4, "unagi jump from 2 to 4");
    CHECK(event_count(&log, ESR_EV_JUMP) == 1, "food jump event emitted");
    CHECK(match.skip[0] == 1, "target tomari node still applies after jump");
}

static void test_mawari_exact_finish_and_bounce(void)
{
    EsrBoard board = make_board(ESR_STYLE_MAWARI);
    EsrMatch match = make_match(&board, 0, 0);
    EsrEventLog log;
    int won;

    match.pos[0] = 15;
    won = esr_apply_roll(&board, &match, 1, &log);
    CHECK(won == 1, "exact one-step finish wins");
    CHECK(match.winner == 0, "black is recorded as winner");

    match = make_match(&board, 0, 0);
    match.pos[0] = 15;
    won = esr_apply_roll(&board, &match, 4, &log);
    CHECK(won == 0, "overshoot must not win");
    CHECK(match.pos[0] == 13, "four steps from 15 bounce back to 13");
    CHECK(event_count(&log, ESR_EV_BOUNCE) == 1, "bounce event emitted");

    match.pos[0] = 16;
    match.winner = 0;
    match.turn = 0;
    won = esr_apply_roll(&board, &match, 2, &log);
    CHECK(won == 0, "a finished match cannot be overwritten");
    CHECK(match.winner == 0, "winner remains frozen after game over");
    (void)won;
}

static void test_tobi_jump_table(void)
{
    EsrBoard board = make_board(ESR_STYLE_TOBI);
    const int expected[6] = {5, 5, 9, 9, 9, 7};

    for (int roll = 1; roll <= 6; ++roll) {
        EsrMatch match = make_match(&board, 0, 0);
        EsrEventLog log;
        match.pos[0] = 7 - roll;
        match.turn = 0;
        (void)esr_apply_roll(&board, &match, roll, &log);
        CHECK(match.pos[0] == expected[roll - 1],
              "tobi roll table destination must match the printed strip");
        if (roll != 6) {
            CHECK(event_count(&log, ESR_EV_JUMP) == 1,
                  "tobi non-zero jump event emitted");
        }
    }
}

static void test_tobi_guard_charm(void)
{
    EsrBoard board = make_board(ESR_STYLE_TOBI);
    EsrMatch match = make_match(&board, ESR_CHARM_GUARD, 0);
    EsrEventLog log;
    match.pos[0] = 6;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 7, "guard charm cancels the -2 spectre jump");
    CHECK((match.charm_used[0] & ESR_CHARM_GUARD) != 0,
          "guard charm is consumed");
    CHECK(event_count(&log, ESR_EV_CHARM) == 1, "charm event emitted");
    CHECK(event_count(&log, ESR_EV_JUMP) == 0, "cancelled jump not emitted");

    match = make_match(&board, 0, 0);
    match.pos[0] = 6;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 5, "without guard the spectre pushes player back");
}

static void test_kesshu_tokens_and_goal_lock(void)
{
    EsrBoard board = make_board(ESR_STYLE_KESSHU);
    EsrMatch match = make_match(&board, 0, 0);
    EsrEventLog log;

    match.pos[0] = 2;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 3, "first token square reached");
    CHECK(match.tokens[0] == 1u, "first warrior token collected");
    CHECK(event_count(&log, ESR_EV_TOKEN) == 1, "token event emitted");

    match.pos[0] = 8;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.tokens[0] == 3u, "second warrior token collected");

    match = make_match(&board, 0, 0);
    match.pos[0] = 16;
    match.tokens[0] = 1u;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.winner < 0, "goal remains locked with only one token");
    CHECK(match.pos[0] == 16, "locked player is pushed back from the goal");
    CHECK(event_count(&log, ESR_EV_GOAL_LOCKED) == 1,
          "goal-locked event emitted");

    match = make_match(&board, 0, 0);
    match.pos[0] = 16;
    match.tokens[0] = 3u;
    match.turn = 0;
    int won = esr_apply_roll(&board, &match, 1, &log);
    CHECK(won == 1, "two-token player can enter the goal");
    CHECK(match.winner == 0, "kesshu winner recorded");
}

static void test_kesshu_duel(void)
{
    EsrBoard board = make_board(ESR_STYLE_KESSHU);
    EsrMatch match = make_match(&board, 0, 0);
    EsrEventLog log;
    match.pos[0] = 2;
    match.pos[1] = 3;
    match.turn = 0;
    (void)esr_apply_roll(&board, &match, 1, &log);
    CHECK(match.pos[0] == 3, "attacker lands on the enemy square");
    CHECK(match.pos[1] == 2, "defender is pushed back one square");
    CHECK(event_count(&log, ESR_EV_DUEL) == 1, "duel event emitted");
}

static void test_wakare_branch(void)
{
    EsrBoard board = make_board(ESR_STYLE_WAKARE);
    EsrEventLog log;
    EsrMatch even = make_match(&board, 0, 0);
    even.pos[0] = 10;
    even.turn = 0;
    (void)esr_apply_roll(&board, &even, 2, &log);
    CHECK(even.pos[0] == 14, "even roll enters the fast good track");
    CHECK(event_count(&log, ESR_EV_BRANCH_GOOD) == 1,
          "good branch event emitted");

    EsrMatch odd = make_match(&board, 0, 0);
    odd.pos[0] = 10;
    odd.turn = 0;
    (void)esr_apply_roll(&board, &odd, 3, &log);
    CHECK(odd.pos[0] == 16, "odd roll enters the slow evil track");
    CHECK(event_count(&log, ESR_EV_BRANCH_EVIL) == 1,
          "evil branch event emitted");
}

static void test_wakare_good_jump_and_evil_stay(void)
{
    EsrBoard board = make_board(ESR_STYLE_WAKARE);
    EsrEventLog log;

    EsrMatch good = make_match(&board, 0, 0);
    good.pos[0] = 12;
    good.turn = 0;
    (void)esr_apply_roll(&board, &good, 1, &log);
    CHECK(good.pos[0] == 14, "good track shortcut jumps one extra square");
    CHECK(event_count(&log, ESR_EV_JUMP) == 1, "good shortcut emits jump");

    EsrMatch evil = make_match(&board, 0, 0);
    evil.pos[0] = 11;
    evil.turn = 0;
    (void)esr_apply_roll(&board, &evil, 1, &log);
    CHECK(evil.pos[0] == 15, "odd roll lands on the first evil square");
    CHECK(evil.skip[0] == 2, "evil track applies a two-turn penance");
}

static void test_mawari_charms(void)
{
    EsrBoard board = make_board(ESR_STYLE_MAWARI);

    EsrMatch stay = make_match(&board, ESR_CHARM_STAY, 0);
    stay.pos[0] = 3;
    stay.turn = 0;
    (void)esr_apply_roll(&board, &stay, 1, NULL);
    CHECK(stay.skip[0] == 0, "stay charm cancels tomari");
    CHECK((stay.charm_used[0] & ESR_CHARM_STAY) != 0,
          "stay charm is consumed");

    EsrMatch dash = make_match(&board, ESR_CHARM_DASH, 0);
    dash.turn = 0;
    (void)esr_apply_roll(&board, &dash, 1, NULL);
    CHECK(dash.pos[0] == 4, "dash charm adds one step on the first roll");
    CHECK((dash.charm_used[0] & ESR_CHARM_DASH) != 0,
          "dash charm is consumed");
    dash.pos[0] = 5;
    dash.turn = 0;
    dash.skip[0] = 0;
    (void)esr_apply_roll(&board, &dash, 1, NULL);
    CHECK(dash.pos[0] == 6, "dash charm is only applied once");
}

static void test_ai_and_edge_cases(void)
{
    EsrBoard board = make_board(ESR_STYLE_WAKARE);
    EsrMatch match = make_match(&board, 0, 0);
    double value = esr_ai_expected_value(&board, &match, 0);
    CHECK(isfinite(value), "AI expected value must be finite");
    CHECK(value > 0.0, "AI expected value should be positive from start");

    match.winner = 0;
    CHECK(esr_ai_expected_value(&board, &match, 0) == 1000.0,
          "AI gives terminal victory maximum value");
    CHECK(esr_ai_expected_value(&board, &match, 1) == -1000.0,
          "AI gives terminal defeat minimum value");

    CHECK(esr_apply_roll(NULL, &match, 1, NULL) == 0,
          "null board is rejected");
    CHECK(esr_apply_roll(&board, &match, 0, NULL) == 0,
          "illegal die value is rejected");
    CHECK(esr_apply_roll(&board, &match, 7, NULL) == 0,
          "seven is rejected");
    CHECK(esr_board_is_connected(NULL) == false, "null connectivity rejected");
}

int main(void)
{
    printf("E-Sugoroku C11 rules regression suite\n");
    printf("-------------------------------------\n");

    test_board_construction();
    test_mawari_movement_and_stay();
    test_mawari_food_jump();
    test_mawari_exact_finish_and_bounce();
    test_tobi_jump_table();
    test_tobi_guard_charm();
    test_kesshu_tokens_and_goal_lock();
    test_kesshu_duel();
    test_wakare_branch();
    test_wakare_good_jump_and_evil_stay();
    test_mawari_charms();
    test_ai_and_edge_cases();

    printf("Checks: %d, failures: %d\n", checks, failures);
    if (failures != 0) {
        fprintf(stderr, "C rules regression tests FAILED\n");
        return 1;
    }
    printf("C rules regression tests passed.\n");
    return 0;
}
