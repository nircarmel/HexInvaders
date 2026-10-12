# Plant Flag Minimax Heuristics

Here is a brief breakdown of the score heuristics the AI minimax uses to evaluate a "Plant Flag" board state:

### 1. Game State Evaluation
*   **Immediate Victory / Defeat (`+/- 500,000`)**: Assigned if any flag reaches its target goal column, overriding all other calculations.  
**Comment**:  I changed from 100,000 to 500,000  

### 2. Flag-Specific Logic
*   **Undefended Flag Penalty (`-25,000`)**: A massive penalty applied if a friendly flag does not have at least one friendly combat unit within moving distance to act as an escort, forcing the AI to build up defenses before rushing.
**Comment**: I think we don't need this one.  it's not about having the escort, rather - it is about the flag being exposed to enemy attacks within 1,2,3 turns. I think the minimax will not allow flag units to go into harms way.  and the way to do it is by getting combat units near it.  

*   **Flag Material Value (`+/- 20,000`)**: Base material value for just having a flag alive on the board, ensuring the AI protects its flags and prioritizes destroying enemy flags.
**Comment**:  I like the idea, but I dont want this to translate into the AI Deciding to spawn too many Flag units just to get more value.     I think a better approach should be the negative of this.   -20,000 for losing a flag unit,   and +20,000 for killing enenmy's flag unit. 


*   **Flag Progression Pressure (`+1,000 / TurnsToGoal²`)**: Exponentially rewards pushing flags closer to the enemy base. A flag 1 turn away is worth +1,000, 2 turns away is +250, etc.
**Comment**: change to flag 1 turn away is worth +5,000, 2 turns away is +2500,  3 turns away - +1500 etc.  ,  and similarily - negative numbers -5000, -2500,-1500  if the enemy's flag unit may get to my base. 

### 3. Combat & Escort Logic
*   **Flag Defender Bonus (`+UnitPower * 20`)**: Rewards combat units for positioning themselves physically between a friendly flag and an approaching enemy threat.
*   **Flag Hunter Bonus (`+150 / Distance`)**: A micro-bounty that actively pulls combat units closer to enemy flags to intercept them.
**Comment**:  change (1) Flag Defender Bonus from  (`+UnitPower * 20`)   to  (`+UnitPower * 500`), change "Flag Hunter Bonus" from (`+150 / Distance`) to (`+1200 / Distance`)

*   **Standard Material survival (`+Strength * 100`)**: General scaling value for keeping standard combat units alive and heavily penalizing when they are standing on tiles where an enemy could lethally strike them on the next turn. 
**Comment**: change (`+Strength * 100`) to (`+Strength * 200`)

These layered weights ensure the AI aggressively targets the flag objective while strictly forcing it to protect its vulnerabilities along the way!
