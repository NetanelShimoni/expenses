#!/usr/bin/env python3
"""
keychain_generator.py
─────────────────────
Generates a 3D-printable keychain as a single watertight STL solid using CadQuery.

Features
  • Rounded-rectangle base body: 100 × 30 × 15 mm
  • Raised (embossed) Hebrew text: "מטר שמעוני" – centred on the top face
  • Key-ring through-hole: ⌀10 mm, near one end (5 mm from the border)

Install dependency:
    pip install cadquery

Run:
    python keychain_generator.py

Output:
    keychain_metar_shimooni.stl  (written to the current working directory)

Notes on Hebrew text
  • CadQuery uses FreeType for text rendering.  The font specified in FONT_NAME
    must contain Hebrew (Unicode) glyphs; "Arial" does on most Windows systems.
  • To use an explicit font file (recommended for reliable Hebrew support):
      set FONT_PATH = "C:/Windows/Fonts/arial.ttf"  and pass fontPath=FONT_PATH
      to the .text() call below.
  • Hebrew is RTL; CadQuery renders characters in the order they are stored in
    the string, which for Python Unicode strings is visual (display) order.
    The printed result is readable on the keychain as-is.
"""

import cadquery as cq

# ── Keychain body ─────────────────────────────────────────────────────────────
LENGTH         = 100.0   # mm – long axis
WIDTH          = 30.0    # mm – short axis
THICKNESS      = 15.0    # mm – overall height / depth
CORNER_RADIUS  = 5.0     # mm – radius for rounded corners

# ── Key-ring hole ─────────────────────────────────────────────────────────────
HOLE_DIAMETER  = 10.0    # mm
# Gap between the keychain end and the nearest edge of the hole
HOLE_MARGIN    = 5.0     # mm
# Derived: hole centre x = -LENGTH/2 + HOLE_MARGIN + HOLE_DIAMETER/2 = -40 mm
hole_cx = -LENGTH / 2 + HOLE_MARGIN + HOLE_DIAMETER / 2

# ── Embossed text ─────────────────────────────────────────────────────────────
TEXT           = "מטר שמעוני"
FONT_SIZE      = 6.0     # mm – character height; reduced to fit within the body
TEXT_RISE      = 2.5     # mm – how much text protrudes above the top face
FONT_NAME      = "Arial"  # change if Arial is not available; must have Hebrew glyphs
# FONT_PATH    = "C:/Windows/Fonts/arial.ttf"  # optional explicit font file

# Text centre: midpoint between the right edge of the hole and the far end
# hole right edge → hole_cx + HOLE_DIAMETER/2 = -35 mm from body centre
# far end          → +LENGTH/2                = +50 mm from body centre
# text centre      → midpoint                 = +7.5 mm from body centre
text_cx = (hole_cx + HOLE_DIAMETER / 2 + LENGTH / 2) / 2   # ≈ +7.5 mm


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 – Base body: rounded-rectangle box
#   .box()        creates a centred box on the XY workplane
#   .edges("|Z")  selects the four vertical corner edges
#   .fillet()     rounds them
# ─────────────────────────────────────────────────────────────────────────────
body = (
    cq.Workplane("XY")
    .box(LENGTH, WIDTH, THICKNESS)
    .edges("|Z")
    .fillet(CORNER_RADIUS)
)

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 – Key-ring through-hole
#   Move to the top face, shift the origin to hole_cx, draw a circle,
#   then cut straight through the entire thickness.
# ─────────────────────────────────────────────────────────────────────────────
body = (
    body
    .faces(">Z")               # select the top face to anchor the workplane
    .workplane()
    .center(hole_cx, 0)        # shift origin to hole position
    .circle(HOLE_DIAMETER / 2)
    .cutThruAll()              # boolean-subtract a cylinder through all
)

# ─────────────────────────────────────────────────────────────────────────────
# Step 3+4 – Raised (embossed) text, fused into the body
#   Select the top face to anchor the workplane, shift the origin to text_cx,
#   then call .text() with combine='a' (add/union) so the glyphs are extruded
#   upward and boolean-unioned with the body in a single step.
#   CadQuery 2.7.0 API: no 'cut' parameter; combine='cut'|'a'|'s'|True|False
# ─────────────────────────────────────────────────────────────────────────────
keychain = (
    body
    .faces(">Z")           # top face → workplane at Z = THICKNESS/2
    .workplane()
    .center(text_cx, 0)    # shift origin to text centre
    .text(
        txt=TEXT,
        fontsize=FONT_SIZE,
        distance=TEXT_RISE,
        font=FONT_NAME,
        # fontPath=FONT_PATH,   # uncomment to use explicit font file
        halign="center",
        valign="center",
        combine="a",           # 'a' = add (emboss), 'cut' = engrave
    )
)

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 – Export STL
# ─────────────────────────────────────────────────────────────────────────────
output_path = "keychain_metar_shimooni.stl"
cq.exporters.export(keychain, output_path)
print(f"Done!  STL saved → {output_path}")
