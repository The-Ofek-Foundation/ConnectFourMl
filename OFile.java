import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.FileFilter;
import java.io.FilenameFilter;
import java.io.IOException;
import java.io.PrintWriter;

import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.nio.file.Path;

import java.security.MessageDigest;
import java.security.DigestInputStream;
import java.security.NoSuchAlgorithmException;

/**
 * OFile
 * Opens file to read/write efficiently and intuitively.
 * @author Ofek Gila
 * @since August 2016
 */
public class OFile extends File {

	private BufferedWriter bufferedWriter;
	private BufferedReader bufferedReader;
	private FileWriter fileWriter;
	private boolean appending;
	private boolean writerOpen, readerOpen;

	/**
	 * Constructor with defined path to file.
	 * Creates the file if doesn't exist.
	 * @param  path string path to file
	 */
	public OFile(String path) {
		super(path);
		appending = false;
		writerOpen = readerOpen = false;
		if (!exists())
			if (path.charAt(path.length() - 1) == '/')
				mkdirs();
			else createNewFile();
	}

	@Override
	public boolean createNewFile() {
		File parentFile = super.getParentFile();
		if (parentFile != null && !parentFile.exists())
			parentFile.mkdirs();
		try {
			return super.createNewFile();
		} catch (IOException e) {
			return false;
		}
	}

	/**
	 * Creates OFile given a {@link File} instance.
	 * @param  file file to create OFile from
	 */
	public OFile(File file) {
		this(file.getPath());
	}

	/**
	 * Creates {@code OFile} given a {@link Path} instance.
	 * @param  path the {@link Path} to create the OFile from
	 */
	public OFile(Path path) {
		this(path.toString());
	}

	/**
	 * Writes string to file
	 * @param  str string to write
	 * @return     OFile instance
	 */
	public OFile write(String str) {
		if (!writerOpen)
			openWriter();
		try {
			bufferedWriter.write(str);
			return this;
		}	catch (IOException e) {}
		return null;
	}

	/**
	 * Writes string to file with specific appending mode
	 * (remembers appending mode in subsequent calls).
	 * @param  str       string to write
	 * @param  appending appending mode (true to append)
	 * @return           OFile instance
	 */
	public OFile write(String str, boolean appending) {
		if (appending != this.appending) {
			this.appending = appending;
			if (writerOpen)
				closeWriter();
			openWriter();
		}
		return write(str);
	}

	/**
	 * Flushes the buffered writer if open.
	 * @return OFile instance
	 */
	public OFile flush() {
		try {
			if (writerOpen)
				bufferedWriter.flush();
			return this;
		} catch(IOException e) {
			return null;
		}
	}

	/**
	 * Reads a single line from file as string.
	 * @return the line
	 */
	public String read() {
		if (!readerOpen)
			openReader();
		try {
			return bufferedReader.readLine();
		}	catch (IOException e) {}
		return null;
	}

	/**
	 * Reads whole file super-efficiently as string.
	 * @return the whole file as string
	 */
	public String readFile() {
		close();
		try {
			FileChannel channel = new FileInputStream(this).getChannel();
			ByteBuffer buffer = ByteBuffer.allocate((int)channel.size());
			channel.read(buffer);
			channel.close();
			return new String(buffer.array());
		}	catch (FileNotFoundException e) {}
			catch (IOException e) {}
		return null;
	}

	/**
	 * Creates and opens {@link BufferedWriter} instance,
	 * closing {@link BufferedReader} instance if necessary.
	 * @return OFile instance
	 */
	public OFile openWriter() {
		if (readerOpen)
			closeReader();
		try {
			fileWriter = new FileWriter(this, appending);
			bufferedWriter = new BufferedWriter(fileWriter);
			writerOpen = true;
		}	catch (IOException e) {}
		return writerOpen ? this:null;
	}

	/**
	 * Creates and opens {@link BufferedReader} instance,
	 * closing {@link BufferedWriter} instance if necessary.
	 * @return OFile instance
	 */
	public OFile openReader() {
		if (writerOpen)
			closeWriter();
		try {
			bufferedReader = new BufferedReader(new FileReader(this));
			readerOpen = true;
		}	catch (IOException e) {}
		return readerOpen ? this:null;
	}

	/**
	 * Closes {@link BufferedWriter} instance.
	 * @return OFile instance
	 */
	public OFile closeWriter() {
		try {
			bufferedWriter.close();
			fileWriter.close();
			writerOpen = false;
			return this;
		}	catch (IOException e) {}
		return null;
	}

	/**
	 * Closes {@link BufferedReader} instance.
	 * @return OFile instance
	 */
	public OFile closeReader() {
		try {
			bufferedReader.close();
			readerOpen = false;
			return this;
		}	catch (IOException e) {}
		return null;
	}

	/**
	 * Closes {@link BufferedReader} instance or
	 * {@link BufferedWriter} instance if open.
	 * @return OFile instance
	 */
	public OFile close() {
		if (writerOpen && closeWriter() == null)
			return null;
		if (readerOpen && closeReader() == null)
			return null;
		return this;
	}

	/**
	 * Clears contents of file.
	 * @return OFile instance
	 */
	public OFile clear() {
		if (close() == null || write("", false) == null || close() == null)
			return null;
		return this;
	}

	/**
	 * Gets {@link BufferedWriter} object for file
	 * @return {@link BufferedWriter} object
	 */
	public BufferedWriter getWriter() {
		if (!writerOpen)
			openWriter();
		return bufferedWriter;
	}

	/**
	 * Gets {@link BufferedReader} object for file
	 * @return {@link BufferedReader} object
	 */
	public BufferedReader getReader() {
		if (!readerOpen)
			openReader();
		return bufferedReader;
	}

	/**
	 * Copies the file to the destination with a {@link StandardCopyOption}.
	 * @param  destination        a path to the destination folder
	 * @param  standardCopyOption the copy option
	 * @return                    the new file
	 */
	public OFile copy(String destination, StandardCopyOption standardCopyOption) {
		close();
		if (isDirectory()) {
			OFile[] filesList = listFiles();
			for (int i = 0; i < filesList.length; i++)
				filesList[i].copy(destination + "/" + filesList[i].getName(),
					standardCopyOption);
			if (filesList.length > 0)
				return new OFile(destination + "/");
		}
		try {
			return new OFile(Files.copy(toPath(), new OFile(destination)
				.toPath(), standardCopyOption));
		} catch (IOException e) {}
		return null;
	}

	/**
	 * Copies file to new destination, replacing existing file if present.
	 * @param  destination a path to the destination folder
	 * @return             the new file
	 */
	public OFile copyReplace(String destination) {
		return copy(destination, StandardCopyOption.REPLACE_EXISTING);
	}

	/**
	 * Checks if two files are equal by matching their checksums.
	 * @param  file1         a {@link File} to compare with
	 * @param  file2         a {@link File} to compare with
	 * @param  nameSensitive care about name of files
	 * @return               true if equal, false otherwise
	 */
	private static boolean filesEqual(File file1, File file2,
		boolean nameSensitive) {
		if (file1.isDirectory() != file2.isDirectory())
			return false;

		if (nameSensitive && !file1.getName().equals(file2.getName()))
			return false;

		if (file1.isDirectory())
			return directoriesEqual(file1, file2, true);

		byte[] file1Checksum = createChecksum(file1);

		if (file1Checksum == null) {
			System.err.printf("Error getting %s checksum!", file1.getPath());
			return false;
		}

		byte[] file2Checksum = createChecksum(file2);
		if (file2Checksum == null) {
			System.err.printf("Error getting %s checksum!", file2.getPath());
			return false;
		}

		for (int i = 0; i < file1Checksum.length; i++)
			if (file1Checksum[i] != file2Checksum[i])
				return false;
		return true;
	}

	/**
	 * Checks if two files are equal by matching their checksums. Also makes
	 * sure they have the same name.
	 * @param  file1 a {@link File} to compare with
	 * @param  file2 a {@link File} to compare with
	 * @return      true if equal, false otherwise
	 */
	public static boolean filesEqual(File file1, File file2) {
		return filesEqual(file1, file2, true);
	}

	/**
	 * Checks if two files are equal by matching their checksums, disregarding
	 * their file names.
	 * @param  file1 a {@link File} to compare
	 * @param  file2 a {@link File} to compare
	 * @return       true if equal, false otherwise
	 */
	public static boolean filesEqualIgnoreName(File file1, File file2) {
		return filesEqual(file1, file2, false);
	}

	/**
	 * Checks if two files are equal by matching their checksums.
	 * @param  file          a non-directory {@link File} to compare with
	 * @param  nameSensitive false if should ignore name of file.
	 * @return      true if equal, false otherwise
	 */
	private boolean equals(File file, boolean nameSensitive) {
		return filesEqual(this, file, nameSensitive);
	}

	/**
	 * Checks if two files are equal by matching their checksums. Also makes
	 * sure they have the same name.
	 * @param  file a {@link File} to compare with
	 * @return      true if equal, false otherwise
	 */
	public boolean equals(File file) {
		return equals(file, true);
	}

	/**
	 * Checks if two non-directory files are equal by matching their checksums.
	 * Ignores name of file.
	 * @param  file a non-directory {@link File} to compare with
	 * @return      true if equal, false otherwise
	 */
	public boolean equalsIgnoreName(File file) {
		return equals(file, false);
	}

	/**
	 * Checks if two directories are equal (contain equal contents).
	 *
	 * @param  d1 a directory to compare
	 * @param  d2 another directory to compare
	 * @return    true if exactly equal, false otherwise
	 */
	private static boolean directoriesEqual(File d1, File d2,
		boolean nameSensitive) {
		File[] d1Files = d1.listFiles();
		File[] d2Files = d2.listFiles();

		if (d1Files.length != d2Files.length)
			return false;

		for (int i = 0; i < d1Files.length; i++)
			if (!filesEqual(d1Files[i], d2Files[i], nameSensitive))
				return false;

		return true;
	}

	/**
	 * Gets this file's checksum if possible
	 * @return a byte array of the checksum
	 */
	public byte[] getChecksum() {
		return createChecksum(this);
	}

	/**
	 * Returns the number of lines contained in the file efficiently
	 * @return number of lines contained in the file
	 */
	public int countLines() {
		close();
		try {
			InputStream is = new BufferedInputStream(new FileInputStream(this));
			try {
				byte[] c = new byte[1024];
				int count = 0;
				int readChars = 0;
				boolean empty = true;
				while ((readChars = is.read(c)) != -1) {
					empty = false;
					for (int i = 0; i < readChars; ++i) {
						if (c[i] == '\n') {
							++count;
						}
					}
				}
				return (count == 0 && !empty) ? 1 : count;
			} finally {
				is.close();
			}
		} catch (IOException e) {
			return -1;
		}
	}

	/**
	 * Creates a checksum for a file
	 * @param  file      the {@link File} to create the checksum for
	 * @return           a byte checksum array
	 * @throws Exception Pokemon error handling.
	 */
	private static byte[] createChecksum(File file) {
		InputStream fis;
		try {
			fis =  new FileInputStream(file);
		} catch (FileNotFoundException e) {
			return null;
		}

		byte[] buffer = new byte[1024];
		MessageDigest complete;
		try {
			complete = MessageDigest.getInstance("MD5");
		} catch (NoSuchAlgorithmException e) {
			return null;
		}
		int numRead;

		try {
			do {
				numRead = fis.read(buffer);
				if (numRead > 0) {
					complete.update(buffer, 0, numRead);
				}
			} while (numRead != -1);
			fis.close();
		} catch (IOException e) {
			return null;
		}

		return complete.digest();
	}

	/**
	 * Returns true if a file at that path exists, false otherwise.
	 * @param  path The path to the file.
	 * @return      true if a file at that path exists, false otherwise.
	 */
	public static boolean fileExists(String path) {
		return new File(path).exists();
	}

	/**
	 * Returns the path to the parent directory.
	 * @return the String path to the parent directory
	 */
	public String getParentPath() {
		return getPath().indexOf("/") == -1 ? "":
			getPath().substring(0, getPath().lastIndexOf("/") + 1);
	}

	/**
	 * Renames this file given a new file.
	 * @param  file a {@link File} to rename to
	 * @return      an updated OFile instance
	 */
	public OFile renameToFile(File file) {
		close();
		if (super.renameTo(file))
			return new OFile(file.getPath() + (isDirectory() ? "/":""));
		else return null;
	}

	/**
	 * Renames this file given a newName.
	 * @param  newName the new name of this file
	 * @return         an updated OFile instance
	 */
	public OFile renameTo(String newName) {
		close();
		String newPath = getParentPath() + newName;
		if (super.renameTo(new File(newPath)))
			return new OFile(newPath + (isDirectory() ? "/":""));
		else return null;
	}

	/* General Overrides */

	/**
	 * @deprecated Does not create new {@code OFile} instance, so getPath and
	 *             others be outdated. Use {@link #renameToFile} instead.
	 */
	@Override
	@Deprecated
	public boolean renameTo(File file) {
		close();
		return super.renameTo(file);
	}

	@Override
	public boolean delete() {
		if (isDirectory()) {
			OFile[] fileList = listFiles();
			for (int i = 0; i < fileList.length; i++)
				fileList[i].delete();
		}
		return super.delete();
	}

	/* And now for File -> OFile overrides */

	@Override
	public OFile getAbsoluteFile() {
		return convertFile(super.getAbsoluteFile());
	}

	@Override
	public OFile getCanonicalFile() {
		try {
			return convertFile(super.getCanonicalFile());
		} catch (IOException e) {}
		return null;
	}

	@Override
	public OFile getParentFile() {
		return convertFile(super.getParentFile());
	}

	@Override
	public OFile[] listFiles() {
		return convertFiles(super.listFiles());
	}

	@Override
	public OFile[] listFiles(FileFilter filter) {
		return convertFiles(super.listFiles(filter));
	}

	@Override
	public OFile[] listFiles(FilenameFilter filter) {
		return convertFiles(super.listFiles(filter));
	}

	/**
	 * Converts a {@link File} into an {@code OFile}.
	 * @param  file the {@link File} to convert
	 * @return      the converted {@code OFile}
	 */
	private static OFile convertFile(File file) {
		if (file != null)
			return new OFile(file);
		return null;
	}

	/**
	 * Converts an array of {@link File}s into an array of {@code OFile}s.
	 * @param  files the  array of {@link File}s to convert
	 * @return       the converted array of {@code OFile}s
	 */
	private static OFile[] convertFiles(File[] files) {
		int numFiles = files.length;
		OFile[] ofiles = new OFile[numFiles];
		for (int i = 0; i < numFiles; i++)
			ofiles[i] = convertFile(files[i]);
		return ofiles;
	}
}