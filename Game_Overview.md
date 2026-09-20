# The Price of War (TPOW) - Core Game Mechanics & Rules

## 1. Overview
**The Price of War** (formerly Hex Invaders) is a deterministic, turn-based tactical strategy game for two players (Blue Team and Red Team). The game is played on a hexagonal grid board. It heavily emphasizes economy management, line of sight, and deterministic combat over randomness. 

## 2. The Board
- The map is a 2D hexagonal grid (flat-topped hexes).
- The extreme left column is the **Blue Home Zone**. The extreme right column is the **Red Home Zone**. 
- Certain tiles can be converted into **Barricades** (dark gray), which are impassable and block line of sight. 

## 3. Game Modes & Goals
There are two primary victory conditions depending on the active game mode:
- **Invade**: The goal is to move *any* friendly unit across the board and step onto the opponent's colored Home Zone (the extreme edge column).
- **Plant Flag**: The goal is to deploy your team's literal "Flag" unit and successfully escort it across the board into the opponent's Home Zone. The Flag unit has 0 combat strength and will be destroyed instantly if attacked by any enemy unit.

## 4. Economy & Deployment
- The game relies on a fixed economy of **Credits**. Both players start with an identical pool of Credits.
- Players use Credits to build and deploy units. 
- A combat unit has two main attributes: **Power** (Strength) and **Speed** (Movement Range). The Credit cost of a unit scales drastically with its Power and Speed. 
- Units can only be purchased and deployed onto empty tiles securely inside the player's own Home Zone.

## 5. Turn Structure
The game strictly alternates turns between Blue and Red. On a player's turn, they have exactly **ONE Action**. An action can be used to execute *one* of the following choices:

### A. Deploy a Unit
The player spends Credits to spawn a newly configured unit in their Home Zone.

### B. Move & Attack
The player selects a deployed unit and moves it up to a maximum distance explicitly matching the unit's **Speed** stat. Pathfinding forbids moving through enemy units, friendly units, or barricades. 
- **Combat**: If a unit's path ends strictly *on* an enemy unit, Combat resolves deterministically:
  - **Deterministic Resolution**: The unit with the higher Power stat always wins. In the event of a tie (equal Power), the attacking unit always wins.
  - **Exhaustion (Depleting Power Engine)**: If enabled, every battle is resolved with the loser being completely destroyed and the winning unit permanently losing exactly 1 power point (regardless of the losing unit's strength). If losing this 1 power point reduces the winning unit to 0 Power, they succumb to their wounds and die alongside the defender.

### C. Construct a Barricade
An active combat unit can intentionally sacrifice itself to convert a set of tiles into an impassable **Barricade**. 
- The size and shape of the Barricade scale based on the sacrificing unit's Power (stronger units build wider, longer barricade walls). 
- **Observation Unit**: When the barricade is successfully built, the sacrificed combat unit is destroyed, but it leaves behind an **Observation Unit** (0 Power, 0 Speed) exactly one hex behind the wall.

## 6. Vision and Fog of War
The game enforces strict Fog of War rules (when configured in "Hidden" or "Nearby" modes):
- Enemy units and their stats are entirely invisible unless they fall within the Line of Sight of at least one friendly unit.
- Line of sight is calculated by raytracing from friendly units. 
- **Barricades block vision** for all standard combat units. 
- **Observation Units** are unique non-combat entities: they have the special ability to perfectly pierce through the local barricade that spawned them, allowing them to indefinitely spot deep into enemy territory behind the safety of a wall. However, they cannot pierce distant enemy barricades.
