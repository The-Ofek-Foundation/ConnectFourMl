
public class GamesPlayed {

	private String fileName;

	public GamesPlayed(String fileName) {
		this.fileName = fileName;
	}

	public static void main(String... pumpkins) {
		GamesPlayed gp = new GamesPlayed(pumpkins[0]);
		gp.run();
	}

	public void run() {
		long numGamesPlayed = getNumGamesPlayed(this.fileName);

		System.out.printf("%,d games played.\n\n", numGamesPlayed);
	}

	public static long getNumGamesPlayed(String fileName) {
		long numGamesPlayed = 0;
		int numStartingPositionsLeft = 7;
		OFile file = new OFile(fileName);
		while (true) {
			String line = file.read();

			if (startingLine(line)) {
				numStartingPositionsLeft--;
				numGamesPlayed += getNumGames(line);

				if (numStartingPositionsLeft == 0)
					break;
			}

		}
		file.close();
		return numGamesPlayed;
	}

	public static boolean startingLine(String line) {
		String[] vars = line.split(" ");
		boolean oneAlready = false;
		for (int i = 0; i < 7; i++)
			if (Integer.parseInt(vars[i]) == 1)
				if (oneAlready)
					return false;
				else oneAlready = true;
			else if (Integer.parseInt(vars[i]) != 0)
				return false;
		return oneAlready;
	}

	public static long getNumGames(String line) {
		String[] vars = line.split(" ");
		long numGamesPlayed = 0;

		for (int i = 7; i < 10; i++)
			numGamesPlayed += Long.parseLong(vars[i]);

		return numGamesPlayed;
	}
}