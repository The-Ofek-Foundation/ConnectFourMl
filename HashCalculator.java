import java.util.ArrayList;

public class HashCalculator {

	public static final String FILE_EXTENSION = ".states";

	private String fileName;
	private int[][] hashes;

	private int[][][] hash1;

	public HashCalculator(String fileName) {
		this.fileName = fileName;
		loadData();
	}

	private void loadData() {
		OFile file = new OFile(fileName + FILE_EXTENSION);
		int numLines = file.countLines();
		System.out.printf("Loading %,d Mcts States... ", numLines);
		startClock();
		hashes = new int[numLines][10];
		for (int i = 0; i < numLines; i++)
			loadHash(file.read(), i);


		file.close();
		System.out.printf("Loaded in %,.2f seconds\n", getTime());
	}

	private void loadHash(String hashLine, int index) {
		String[] line = hashLine.split(" ");

		for (int i = 0; i < hashes[index].length; i++)
			hashes[index][i] = Integer.parseInt(line[i]);
	}

	public static void main(String... pumpkins) {
		HashCalculator hc = new HashCalculator(pumpkins[0]);
		hc.calculateHash();
		hc.saveHashed();
	}

	public void saveHashed() {
		OFile hashFile = new OFile(fileName + ".c4hash");
		hashFile.write(mod + "\n");
		for (int i = 0; i < hash1.length; i++)
			if (hash1[i][0][0] != 0) {
				hashFile.write(i + "\n");
				hashFile.write(hash1[i][0][0] + "\n");
				for (int a = 0; a < hash1[i][0][0]; a++) {
					for (int b = 0; b < 9; b++)
						hashFile.write(hash1[i][a + 1][b] + " ");
					hashFile.write(hash1[i][a + 1][9] + "\n");
				}
			}
		hashFile.close();
	}

	private final int mod = 2000003;

	public void calculateHash() {
		hash1 = new int[mod][10][10]; // 10000 potential collisions o_O

		int count = 0;
		int maxCollisions = 0, maxi = -1;
		for (int[] hash : hashes) {
			int sum = 0;
			int prod = 1;
			int janky = 0;
			for (int i = 0; i < 7; i++) {
				int num = hash[i];
				sum += num;
				prod *= num;
				janky = sum + prod;
			}
			prod %= janky;
			// long sumpow = 0;
			// for (int i = 0; i < hash.length; i++)
			// 	sumpow += Math.pow(hash[i], i);
			// int index = Math.abs((int)((sum + sumpow + prod + janky) % mod));
			long prodpow = 1;
			long sumpow = janky;
			long powsum = 0, powsumr = 0;
			String chars = "";
			for (int num : hash)
				chars += num + " ";
			chars = chars.substring(0, chars.length() - 1);
			// System.out.println(chars.hashCode());
			for (int i = 0; i < hash.length; i++) {
				// prodpow *= Math.pow(hash[i] + sum, i);
				// sumpow += Math.pow(hash[i], i);
				powsum  += hash[i] * Math.pow(10, i);
				powsumr += hash[i] * Math.pow(10, 6 - i);
			}
			long has = 0;
			for (int i = 0; i < 7; i++) {
				int num = hash[6 - i];
				long c = num + (long)'0';
				has = (has <<  5) - has + c;
				has = has & has;
			}
			int index = Math.abs((int)((has) % mod));
			int subindex = hash1[(int)index][0][0] + 1;
			if (subindex > maxCollisions) {
				maxCollisions = subindex;
				maxi = index;
			}
			for (int i = 0; i < hash.length; i++)
				try {
					hash1[(int)index][subindex][i] = hash[i];
				} catch (ArrayIndexOutOfBoundsException e) {
					for (int[] ha : hash1[(int)index]) {
						for (int h : ha)
							System.out.print(" " + h);
						System.out.println();
					}
					return;
				}
			hash1[(int)index][0][0]++;
			count++;
		}
		System.out.println("Generated Hashes");
		System.out.printf("Max %d collisions\n", maxCollisions);
		for (int[] ha : hash1[maxi]) {
			for (int h : ha)
				System.out.print(" " + h);
			System.out.println();
		}
	}

	private int[] getHash(String position) {
		int[] heights = new int[7];
		int[] hash = new int[7];

		for (int i = 0; i < position.length(); i++) {
			int col = (position.charAt(i) - '0') - 1;
			hash[col] += (i % 2 + 1) * (int)(Math.pow(3, heights[col]));
			heights[col]++;
		}
		return smallerHash(hash);
	}

	private double startTime;
	private void startClock() {
		startTime = System.nanoTime();
	}
	private double getTime() {
		return (System.nanoTime() - startTime) / 1E9;
	}

	public static int compare(int[] hash1, int[] hash2) {
		for (int i = 0; i < hash1.length; i++)
			if (hash1[i] != hash2[i])
				return hash1[i] - hash2[i];
		return 0;
	}

	public static int[] smallerHash(int[] hash) {
		int[] reverseHash = new int[hash.length];
		for (int i = 0; i < hash.length; i++)
			reverseHash[hash.length - i - 1] = hash[i];

		if (compare(hash, reverseHash) < 0)
			return hash;
		return reverseHash;
	}
}
