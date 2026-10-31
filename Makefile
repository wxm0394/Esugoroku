SHELL := /bin/bash

CC ?= gcc
CFLAGS ?= -std=c11 -O2 -Wall -Wextra -Werror
NODE ?= node
PYTHON ?= python3
PORT ?= 3000

BUILD_DIR ?= /tmp/esugoroku-build
OBJ := $(BUILD_DIR)/esugoroku.o
BIN := $(BUILD_DIR)/test_rules

.PHONY: all build test test-c test-js test-browser verify verify-browser serve clean help

all: test

help:
	@echo "E-Sugoroku targets:"
	@echo "  make build          compile the C11 engine and test binary"
	@echo "  make test           C11 + JavaScript rules tests"
	@echo "  make test-browser   headless Chromium E2E"
	@echo "  make verify         full verification without browser"
	@echo "  make verify-browser full verification including browser"
	@echo "  make serve          start the preview server (PORT=$(PORT))"
	@echo "  make clean          remove build artifacts"

build: $(BIN)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(OBJ): core/esugoroku.c core/esugoroku.h | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c core/esugoroku.c -o $(OBJ)

$(BIN): core/test_rules.c $(OBJ) | $(BUILD_DIR)
	$(CC) $(CFLAGS) core/test_rules.c $(OBJ) -o $(BIN)

test-c: $(BIN)
	$(BIN)

test-js:
	$(NODE) tools/test_js_rules.mjs

test: test-c test-js

test-browser:
	$(PYTHON) tools/test_browser_e2e.py --port $(PORT)

verify:
	$(PYTHON) tools/verify_all.py

verify-browser:
	$(PYTHON) tools/verify_all.py --browser --port $(PORT)

serve:
	PORT=$(PORT) $(NODE) server.js

clean:
	rm -rf $(BUILD_DIR)
