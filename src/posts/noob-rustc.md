---
title: Noob Hacking on Rustc Part 1
slug: noob-hacking-on-rustc-part-1
excerpt: Me stumbling through my first rustc issue
date: 2022-12-22
---

This is me reflecting on my first issue: [#102608](https://github.com/rust-lang/rust/issues/102608) contributing to rustc and figured it might be useful for others. Two months after signing up for a rustc issue I actually started working on it.

### The Problem

**Improve diagnostics like "incompatible types: expected fn item, found a different fn item"**

Given the input

```rust
fn double(n: u32) -> u32 { n * 2 }

fn triple(n: u32) -> u32 { n * 3 }

fn f(n: u32) -> u32 { 
    let g = if n % 2 == 0 { &double } else { &triple };
    g(n) 
}

fn main() { 
    assert_eq!(f(7), 21); 
    assert_eq!(f(8), 16); 
}
```

the output is

```
error[E0308]: `if` and `else` have incompatible types
  --> ./cases/0.rs:14:46
   |
14 |     let g = if n % 2 == 0 { &double } else { &triple };
   |                             -------          ^^^^^^^ expected fn item, found a different fn item
   |                             |
   |                             expected because of this
   |
   = note: expected reference `&fn(u32) -> u32 {double}`
              found reference `&fn(u32) -> u32 {triple}`
   = note: different fn items have unique types, even if their signatures are the same

error: aborting due to previous error

For more information about this error, try `rustc --explain E0308`.
```

The diagnostics don't explain why the types are incompatible despite having identical signatures, `fn(u32) -> u32`. More detail should be given as to why and/or output something that the operator can use to learn more. If possible, a suggestion would be nice.

## Prep

There are several ways you can manage your directories with git, but I've come to really enjoy using worktrees.

Why the worktree approach? Because I got tired of `git stash`'ing my changes just to update my local copy of master.

After forking the `rust-lang/rust` [GitHub repo](https://github.com/rust-lang/rust) I did the following.

```sh
$ mkdir rustlang
$ cd rustlang
$ git clone https://github.com/<your-repo>/rust.git master
$ cd master

# Add the rust repo as the upstream
$ git remote add upstream https://github.com/rust-lang/rust.git

# add worktree branch
$ git worktree add ../my-branch

# your directory structure should look something like this
$ tree -L 1
. # rustlang
├── my-branch
└── master

# If you want to update the `master` branch with the main rust repo
$ cd master
$ git pull upstream master

# If you want to update your development branch to match the master branch
$ cd my-branch
$ git merge master
```

Now that we've cleared and organized the counter, let's crack some eggs.

## Building rustc

@pnkfelix has a great [video](https://youtu.be/oG-JshUmkuA) on bootstrapping rustc. In it, he covers different methods to build the rust compiler and their effects on the size of build artifacts, symbols for debugging, and (most importantly) build times.

If you've never built rustc before, it'll be useful to generate a `config.toml` file that rustc will use when building.

```bash
$ ./x.py setup
Welcome to the Rust project! What do you want to do with x.py?
a) library: Contribute to the standard library
b) compiler: Contribute to the compiler itself
c) codegen: Contribute to the compiler, and also modify LLVM or codegen
d) tools: Contribute to tools which depend on the compiler, but do not modify it directly (e.g. rustdoc, clippy, miri)
e) user: Install Rust from source
Please choose one (a/b/c/d/e):
# we're trying to hack on the compiler itself, so we'll choose b
$ b
```

You should now have a `config.toml` file in the root directory with some default configs. For more info, you can check out the `config.toml.example` file in the root directory.

Cool, now let's build.

```bash
$ ./x.py build
```

At this point you can probably go write a masters thesis and it should be done by the time you get back. (Joking...sort of) But it is a good opportunity to get a coffee or tea.

## Using our new rustc binary

Now that the build has finished, we can compile something with our new binary.

```sh
$ ./build/x86_64-unknown-linux-gnu/stage1/bin/rustc some-example.rs
```

This produces a `some-example` binary in the directory that rustc is run. 
You can change this behavior using rustc's `-o <FILENAME>` and `--out-dir <DIR>` options.

For convenience, I like keeping the `*.rs` files I use for testing and compiling in a separate folder. 
By default, a folder called `cases` is ignored within the main directory, and since we're using a worktree approach, this folder (and the files in it) will be worktree-specific.
This is rather convenient for keeping your files constrained to a single issue you're working on. 

```
$ tree -L 1 . # rustlang/ 
├── my-branch
│   └── cases
└── master
.

# we can then run a case from `my-branch`'s locally built compiler
$ ./build/x86_64-unknown-linux-gnu/stage1/bin/rustc cases/some-example.rs
```

After confirming that outputs from my local file on my locally built compiler are the same, we can start searching for where to start.

## Grepping through the dark

For things like diagnostics outputs, one easy way to begin is by grepping.

After grepping via ``rg "\`if\` and \`else\` have incompatible types"`` .

Ignoring outputs from `src/test/*` directories, we can see outputs from some locations:

*   `compiler/rustc_infer/src/infer/note.rs`
    
*   `compiler/rustc_infer/src/infer/error_reporting/mod.rs`
    
*   `compiler/rustc_hir_typeck/src/_match.r`
    
*   `compiler/rustc_error_messages/locales/en-US/infer.ftl`
    

## Dragonball Z-flags

`-Z` flags are options you can use with rustc to modify its behavior.

To see what options are available, use `rustc -Zhelp`.

You may find it useful to ask the appropriate working-group what their favorite `-Z` flags are.

One flag that is useful for diagnostics is `-Ztreat-err-as-bug` .

This crashes the program after encountering an error, providing us with a stacktrace we can use.

Let's give it a try by running `./build/x86_64-unknown-linux-gnu/stage1/bin/rustc -Ztreat-err-as-bug cases/problem-example.rs`.

```
error: internal compiler error: coercion error but no error emitted
  --> cases/1.rs:37:46
   |
37 |     let g = if n % 2 == 0 { &double } else { &triple };
   |                                              ^^^^^^^

thread 'rustc' panicked at 'aborting due to `-Z treat-err-as-bug=1`', compiler/rustc_errors/src/lib.rs:1635:30
stack backtrace:
   0:     0x7fbed730834a - std::backtrace_rs::backtrace::libunwind::trace::h775a0f918ba027cd
                               at rustlang/my-branch/library/std/src/../../backtrace/src/backtrace/libunwind.rs:93:5
   1:     0x7fbed730834a - std::backtrace_rs::backtrace::trace_unsynchronized::h780ce3e7e1bee518
                               at rustlang/my-branch/library/std/src/../../backtrace/src/backtrace/mod.rs:66:5
   2:     0x7fbed730834a - std::sys_common::backtrace::_print_fmt::hb46bfd4f7a6fb3d0
                               at rustlang/my-branch/library/std/src/sys_common/backtrace.rs:65:5
.
.
.
### WALL OF TEXT
.
.
.
### MORE WALL OF TEXT
.
.
.
### EDGE OF THE EARTH
```

....Ok.... that's a lot of text (~170 lines). This is a bit of the problem with using `-Ztreat-err-as-bug`. Sometimes (such as in this case) the stacktrace can be fairly large. We're still new to the compiler so we don't know exactly what is what. Let's save this to a file and try to chop it up.

```
# rerun the previous command, save to stacktrace.log, sending stderr to stdout
$ !! > backtrace.log 2>&1
```

Now we can open `backtrace.log` with our favorite editor (VIM-based of course, come at me bruh) and try to separate things out.

```
thread 'rustc' panicked at 'aborting due to `-Z treat-err-as-bug=1`', compiler/rustc_errors/src/lib.rs:1635:30
stack backtrace:
   0:     0x7fbed730834a - std::backtrace_rs::backtrace::libunwind::trace::h775a0f918ba027cd
                               at rustlang/my-branch/library/std/src/../../backtrace/src/backtrace/libunwind.rs:93:5
   1:     0x7fbed730834a - std::backtrace_rs::backtrace::trace_unsynchronized::h780ce3e7e1bee518
                               at rustlang/my-branch/library/std/src/../../backtrace/src/backtrace/mod.rs:66:5
   2:     0x7fbed730834a - std::sys_common::backtrace::_print_fmt::hb46bfd4f7a6fb3d0
                               at rustlang/my-branch/library/std/src/sys_common/backtrace.rs:65:5

###### More panic handling stuff ####

  16:     0x7fbed72e4762 - rust_begin_unwind
                               at rustlang/my-branch/library/std/src/panicking.rs:575:5
  17:     0x7fbed7294873 - core::panicking::panic_fmt::h782aa8f19e20634a
                               at rustlang/my-branch/library/core/src/panicking.rs:64:14

###### something about diagnostics, and look! our `treat-err-as-bug` flag ##########

  18:     0x7fbedb45c76d - <rustc_errors[906e6b8151163e8]::HandlerInner>::panic_if_treat_err_as_bug
  19:     0x7fbedb45be1a - <rustc_errors[906e6b8151163e8]::HandlerInner>::emit_diagnostic
  20:     0x7fbed84ac17a - <rustc_errors[906e6b8151163e8]::HandlerInner>::emit_diag_at_span::<rustc_span[7043bc1089c16edd]::span_encoding::Span>
                               at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:1518:9

###### Something about sessions, delay_span_bug ######

  21:     0x7face6055439 - <rustc_errors[906e6b8151163e8]::HandlerInner>::span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str>
                               at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:1513:9
  22:     0x7face604a6e0 - <rustc_errors[906e6b8151163e8]::HandlerInner>::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str>
                               at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:1534:13
  23:     0x7face604a6e0 - <rustc_errors[906e6b8151163e8]::Handler>::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str>
                               at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:982:9
  24:     0x7face5ff3d3c - <rustc_session[8b3fad31ea08cccb]::session::Session>::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str>
                               at rustlang/my-branch/compiler/rustc_session/src/session.rs:600:9

###### Oh look! More stuff about `rustc_hir_typeck`, we saw this area while grepping #######

  25:     0x7fbed849fc1b - <rustc_hir_typeck[dce7f99ee2420e40]::coercion::CoerceMany<&rustc_hir[b1e38f7f69e16ea3]::hir::Expr>>::coerce_inner
                               at rustlang/my-branch/compiler/rustc_hir_typeck/src/coercion.rs:1514:21
  26:     0x7fbed82d765a - <rustc_hir_typeck[dce7f99ee2420e40]::coercion::CoerceMany<&rustc_hir[b1e38f7f69e16ea3]::hir::Expr>>::coerce
                               at rustlang/my-branch/compiler/rustc_hir_typeck/src/coercion.rs:1375:9
  27:     0x7fbed82d765a - <rustc_hir_typeck[dce7f99ee2420e40]::fn_ctxt::FnCtxt>::check_then_else
                               at rustlang/my-branch/compiler/rustc_hir_typeck/src/expr.rs:1022:13
  28:     0x7fbed82d765a - <rustc_hir_typeck[dce7f99ee2420e40]::fn_ctxt::FnCtxt>::check_expr_kind
                               at rustlang/my-branch/compiler/rustc_hir_typeck/src/expr.rs:341:17
  29:     0x7fbed825dfd4 - <rustc_hir_typeck[dce7f99ee2420e40]::fn_ctxt::FnCtxt>::check_expr_with_expectation_and_args::{closure#0}
                               at rustlang/my-branch/compiler/rustc_hir_typeck/src/expr.rs:237:18

###### Stuff dealing with `rustc_middle` and `rustc_data_structures` 
###### More stuff about `rustc_hir_typeck`, with similar outputs 
###### Something about`rustc_middle` and `rustc_query_system` ######
###### Stuff about `rustc_driver`, `rustc_iterface::interface::run_compiler`, and `rustc_span::create_session_globals_then`

# `rustc_driver` is the part of rustc that handles the command line inputs, such as -Z flags

 159:     0x7fbed72a7555 - std::sys::unix::thread::Thread::new::thread_start::h56e3715092ca179e
                               at rustlang/my-branch/library/std/src/sys/unix/thread.rs:108:17
 160:     0x7fbed707c8fd - <unknown>
 161:     0x7fbed70fea60 - <unknown>
 162:                0x0 - <unknown>
.
.
.
query stack during panic:
#0 [typeck] type-checking `f`
#1 [typeck_item_bodies] type-checking all item bodies
#2 [analysis] running analysis passes on this crate
end of query stack
```

Great. So what did we get out of this? Well, we know that the last block of the backtrace before unwinding is about `rustc_hir_typeck`.

Specifically

*   `coercion::coerce_inner()` is the last thing called before the diagnostics are emitted.
    
*   `expr::{check_expr_with_expectation_and_args, check_expr_kind}`
    

Let's take a look at `coerce_inner` in `compiler/rustc_hir_typeck/coercion.rs`.

Here's a [link](https://doc.rust-lang.org/nightly/nightly-rustc/src/rustc_hir_typeck/coercion.rs.html#1410) to the nightly docs.  
If that is out-of-date, go to `rustc_hir_typeck`'s [docs](https://doc.rust-lang.org/nightly/nightly-rustc/rustc_hir_typeck/index.html) and use the search bar to find `coerce_inner`'s source code.

This function is almost 200 lines of code long, so let's scan things quickly and see if anything sticks out.

```rs
// rustc_hir_typeck/coercion.rs:1509
Err(coercion_error) => {
    // Mark that we've failed to coerce the types here to suppress
    // any superfluous errors we might encounter while trying to
    // emit or provide suggestions on how to fix the initial error.
    fcx.set_tainted_by_errors(
        fcx.tcx.sess.delay_span_bug(cause.span, "coercion error but no error emitted"),
    );
// rest of code block
```

Jackpot! (maybe) Did you spot it? Not just that it says `coercion_error`, but it also calls some functions with interesting names:

*   `fcx.set_tainted_by_errors`
    
*   `fcx.tcx.sess.delay_span_bug` Oh yeah, we've seen this before. Cue flashback to our initial \`backtrace.log
    

```

# flashback

22: 0x7face604a6e0 - rustc_errors[906e6b8151163e8]::HandlerInner>::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str> at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:1534:13 

23: 0x7face604a6e0 - <rustc_errors[906e6b8151163e8]::Handler>::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str> at rustlang/my-branch/compiler/rustc_errors/src/lib.rs:982:9

# Here!

24: 0x7face5ff3d3c - <rustc_session[8b3fad31ea08cccb]::session::Session<::delay_span_bug::<rustc_span[7043bc1089c16edd]::span_encoding::Span, &str> at rustlang/my-branch/compiler/rustc_session/src/session.rs:600:9

25: 0x7fbed849fc1b - <rustc_hir_typeck[dce7f99ee2420e40]::coercion::CoerceMany<&rustc_hir[b1e38f7f69e16ea3]::hir::Expr>>::coerce_inner at rustlang/my-branch/compiler/rustc_hir_typeck/src/coercion.rs:1514:21
```

If we keep scanning, we'll see the following code block

```rust
match *cause.code() { 
    ObligationCauseCode::ReturnNoExpression => {...}
    ObligationCauseCode::BlockTailExpression(blk_id) => {...}
    ObligationCauseCode::ReturnValue(id) => {...}
    _ => {...}
}
```

It looks like each match arm does something a little different, so let's figure out which arm we're actually matching to. We can try using the ancient art of print debugging to see which route we're taking (or not taking).

## println!("Here")

So instead of using the `println` macro, we're going to use the logging and tracing features that rustc has built-in. But first we must enable debugging and rebuild the compiler so it will emit traces.

```toml
# config.toml
# see config.toml.example in the root directory for explanations cuz I'm lazy
[rust]
debug = true
```

Something to keep in mind is that debug builds take a while to... build. Let's rebuild while we go write another thesis paper.

```bash
$ ./x.py build
```

![One eternity later… | spongebob meme](http://sun9-43.userapi.com/impg/LFp5vvGMk6S_xX2ZEr_qD0BxVLCirPqZG2YsYA/ZsM5LCxhxSo.jpg?size=1280x720&quality=96&sign=a787d40e0af9dfecdb2e220e71646cfd&type=album align="left")

Now we can view debug statemements by setting `RUSTC_LOG=debug` when we try to compile something.

Go ahead and give it a try. I'll wait.

```bash
$ RUSTC_LOG=debug ./build/x86_64-unknown-linux-gnu/stage1/bin/rustc cases/some-example.rs
```

Lots of text, right?  
Not sure where to begin?  
Me neither.

So how about we start with what we know. We want to see which route is being taken. We want to look into the `coerce_inner` function which resides in the `rustc_hir_typeck` crate, specifically in `coercion.rs`.

We can reduce the output by using filters for our logs.

```sh
# emit debug traces for rustc_hir_typeck
$ RUSTC_LOG=rustc_hir_typeck::coercion=debug ./build/x86_64-unknown-linux-gnu/stage1/bin/rustc cases/some-example.rs
```

This still feels like a good amount of text, so let's add some print statements that we can easily search for and narrow down our search.

```rs
// I like to use my handle so it's easy to find and remove before I make a commit
debug!("mattjperez - cause.code(): {:?}", *cause.code());
match *cause.code() {
    ObligationCauseCode::ReturnNoExpression => {
        debug!("mattjperez - A");
        ...
    }
    ObligationCauseCode::BlockTailExpression(blk_id) => {
        debug!("mattjperez - B");
        ...
    }
    ObligationCauseCode::ReturnValue(id) => {
        debug!("mattjperez - C");
        ...
    }
    _ => {
        debug!("mattjperez - D");
        ...
    }
}
```

Now we recompile so rustc has our new debug statements. But before we go using plain 'ol `./x.py build`, let's see if we can reduce the build time a bit. We will use the `--keep-stage` flag to reduce our compilation times. I'm still not sure how it works, but you can read a bit more about it [here](https://rustc-dev-guide.rust-lang.org/building/suggested.html?highlight=keep-stage#faster-builds-with---keep-stage)

> @pnkfelix also covers this a bit in his video. In addition, during his [office hours](https://www.youtube.com/watch?v=XnxecFpuzLo), he says one of the best things you can do early on is learning how to reduce compilation times.

```sh
$ ./x.py build --keep-stage 1
```

Once that's done, let's try it again.

```sh
RUSTC_LOG=rustc_hir_typeck::coercion=debug ./build/x86_64-unknown-linux-gnu cases/some-example.rs > coercion.log 2>&1
```

Now if we search for `mattjperez - cause.code()` we find this strange thing.

```
├─1ms DEBUG rustc_hir_typeck::coercion mattjperez - cause code: IfExpression(IfExpressionCause { then_id: HirId { owner: OwnerId { def_id: DefId(0:5 ~ 0[5c7b]::f) }, local_id: 15 }, else_id: HirId { owner: OwnerId { def_id: DefId(0:5 ~ 0[5c7b]::f) }, local_id: 21 }, then_ty: _, else_ty: _, outer_span: None, opt_suggest_box_span: None })
```

... well that isn't helpful. Good thing we added some extra print statements while we were at it. If we look a bit further down we can find

```
├─1ms DEBUG rustc_hir_typeck::coercion mattjperez - D
```

Great! Now we can look closer at that code block

```rust
rs _ => { debug!("mattjperez - D"); err = fcx.err_ctxt().report_mismatched_types( cause, expected, found, coercion_error, ); }
```

If we grep for `fn report_mismatched_types` we see one of the matches is

```
compiler/rustc_infer/src/infer/mod.rs 1742: pub fn report_mismatched_types(
```

which internally calls `report_and_explain_type_error`. Grepping again we find

```
compiler/rustc_infer/src/infer/error_reporting/mod.rs
1874:    pub fn report_and_explain_type_error(
```

There we can find a very interesting match block

```rust
let mut diag = match failure_code { 
    FailureCode::Error0038(did) => {...} 
    FailureCode::Error0317(failure_str) => {...}
    FailureCode::Error0580(failure_str) => {...}
    FailureCode::Error0308(failure_str) => {...}
    FailureCode::Error0644(failure_str) => {...} 
};
```

That `FailureCode::Error0308` matches something we've seen from our normal compiler error.

```
// ./build/x86_64-unknown-linux-gnu/stage1/bin/rustc cases/some-example.rs 

error[E0308]: `if` and `else` have incompatible types --> src/main.rs:13:9 ...
```

Long story short, those match arms are creating a [Diagnostics Structure](https://rustc-dev-guide.rust-lang.org/diagnostics.html?highlight=diagnostic#diagnostic-structure), `diag` .  
If we look into `FailureCode::Error0308`'s arm, we can see that it's modifying the `Diagnostic` struct depending on `expected.kind()` and `found.kind()`.  
Before returning, `diag` is then passed into `self.note_type_err()`.

Looking into `self.note_type.err` we find.... another 450-line function.

I'll spare you some pain and direct you to the end of the function before it returns. You can see another interesting code block.

```rust
if should_suggest_fixes { 
    self.suggest_tuple_pattern(cause, &exp_found, diag);
    self.suggest_as_ref_where_appropriate(span, &exp_found, diag);
    self.suggest_accessing_field_where_appropriate(cause, &exp_found, diag);
    self.suggest_await_on_expect_found(cause, span, &exp_found, diag); }
```

I get a feeling this might be a good place to add our new suggestions. But I think this post is long enough. We'll continue in the next one about how we might implement our suggestions.

## Quick Recap

So some stuff we covered here we're

*   Building rustc
    
*   Getting a stacktrace from a diagnostics err with `-Z` flags
    
*   Using grep for finding function definitions
    
*   Building rustc for debugging
    
*   Adding debug statements to rustc source code
    
*   Using filters for debug output
    
*   Using the \`--keep-stage\` flag for faster builds
    

## Yeah... that didn't happen

Full disclosure: The last few paragraphs are hindsight because I initially used these techniques poorly. I spent a few days falling into different rabbit holes around rustc until @compiler-errors pointed me in the right direction (straight to `fn note_type_err` ).

It seems obvious now, but I initially didn't see any connection between between `rustc_infer` and `rustc_hir_typeck` in the backtrace.

I had found `coerce_inner` immediately, but (probably) due to inexperience with how rustc works and not having worked on such a large project before, I got lost in the sauce for a few days. For context, one of the earlier draft titles was *Five Stages of Grief*.

Still not understanding how `note_type_err` was connected to `coerce_inner` I spent the last couple of days tracking things down and writing this blog post.

I hope it was informative.

See you in part 2 where we try to implement a solution.
