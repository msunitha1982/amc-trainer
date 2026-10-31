# Topic classification guide

Used by the classifiers that produce `data/topics.json`. Each problem gets **1–3 tags** from this list, most relevant first:

| tag | use for |
|---|---|
| `algebra.polynomials` | polynomial roots, Vieta, factoring, quadratics |
| `algebra.functions` | function evaluation and composition, functional equations, graphs of functions |
| `algebra.inequalities` | AM-GM, optimization, bounding, inequality solving |
| `algebra.sequences` | arithmetic/geometric sequences, series, recursions, sums |
| `algebra.logs` | logarithms, exponents, radicals and powers |
| `algebra.systems` | systems of equations, word problems that reduce to linear equations, rates, ratios, percents |
| `geometry.triangles` | triangles, polygons, areas, similar figures, Pythagoras, trig in triangles |
| `geometry.circles` | circles, arcs, tangents, inscribed angles, power of a point |
| `geometry.coordinate` | coordinate plane, lines, distance, lattice points, complex-plane geometry |
| `geometry.solid` | 3D: solids, volume, surface area, cubes, spheres |
| `geometry.transformations` | reflections, rotations, symmetry, folding, tilings, dilations |
| `number_theory.divisibility` | divisors, gcd/lcm, factorization, digits, integer solutions |
| `number_theory.modular` | remainders, modular arithmetic, units digits, cycles |
| `number_theory.primes` | primes, prime factorization questions |
| `number_theory.bases` | number bases, digit representations in other bases |
| `counting.combinatorics` | permutations, combinations, arrangements, binomial coefficients |
| `counting.expected_value` | expected value, averages of random outcomes |
| `counting.casework` | counting by cases, complementary counting, logic/arrangement puzzles |
| `counting.geometric_probability` | probability with lengths or areas, continuous probability |

Rules:
- Tag by the **mathematics needed to solve it** (the solutions show this), not by surface story.
- Plain discrete probability gets `counting.combinatorics` or `counting.casework`. Use `counting.geometric_probability` only for continuous or geometric settings.
- Pure arithmetic or "word problem" warm-ups usually fit `algebra.systems`.
- Logic puzzles and games go to `counting.casework`.
