@AGENTS.md

Build a green ride sharing web app with the following requirements:
Requirement 1: The system must allow users to create an account using a Monash email and password.

Requirement 2/3: The system must allow passengers to choose rides and book vacancies. 
The user should be able to search for a ride by campus, date, and time, then select a ride that still has available seats.
The system displays matching ride cards with route, departure time, driver details, and available seats. 
The passenger selects a ride, reviews the ride details, then confirms the booking. 
Frontend ride search page connects to the backend ride and booking service. The backend reads ride offers from the database, checks seat availability, creates the booking record, and updates the number of available seats. 

Requirement 4: When selecting the carpooling options, the system displays a comparative dashboard of other existing options
The dashboard should compare transport options using practical factors: estimated travel time, estimated cost, and estimated emissions. 
Passenger selects a ride, the dashboard shows comparison cards for carpooling, PTV, and private vehicle travel. 
Each card displays estimated travel time, cost, and emissions. 
The user can quickly see the trade-off between each option before deciding whether to continue with the carpool booking. 
Frontend dashboard connects to a backend comparison service. The comparison service uses stored ride data, estimated trip distance, and public transport data where available (PTV API)

Algorithm or formula to calculate the carbon emissions.
The system does not only claim that carpooling is greener. It also show an estimated emissions value using a consistent calculation method. 
In the comparison dashboard, each transport option includes an estimated emissions value.
For carpooling, the emissions estimate is divided by the number of passengers, so users can see the per-person impact
This helps the user understand how sharing a ride can reduce individual emissions compared with driving alone. 
Frontend dashboard connects to an emissions calculation service. The backend receives trip distance, vehicle or fuel assumptions, and passenger count, then calculates estimated emissions. 

Requirement 5: The final piece on the feature side is the reward system. As users take greener trips and accumulate CO2 savings, they earn green points and unlock milestones. The key to this is a virtual pet, it starts as an egg, hatches, and grows as the user continues making environmentally conscious choices. 

Data Sources: 
- Department of Climate Change, Energy, the Environment and Water. (2024). Australian National Greenhouse Accounts Factors 2024. Australian Government. https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-accountfactors-2024.pdf
- Public Transport Victoria. (n.d.). Public transport timetable API. Victoria State Government. https://www.vic.gov.au/public-transport-timetable-ap
- kaggle.com/datasets/debajyotipodder/co2-emission-by-vehicles

Tech stack:
- Frontend: Nextjs/TS
- Backend: Python/Fastapi
- Database: Supabase
- Deployment: Render (backend), Vercel (frontend)