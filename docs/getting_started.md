# Getting Started

Welcome! Your journey as a programmer for FRC starts here. Before we being programming, there are a few things we must download and get set up.

## Installing WPILib VS Code
WPILib is an open-source framework for FRC programming provided by the WPI Institute. They provide WPILib VS Code, which is what we will be using to code.


<div style="display: flex; align-items: center; gap: 15px;" markdown>

<div style="width: 500px;" markdown>
![Install WPILib](assets/WPILibInstaller.png#only-light)
![Image title](assets/WPILibInstallerDark.png#only-dark)
</div>

<div markdown>
Go [here](https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-2/wpilib-setup.html)  
and scroll down to download the installer. This should download an iso file.
</div>

</div>

Once you finish downloading, double click the .iso file to open it in your file explorer. Here, double click WPILibInstaller.exe.

If you get a "Windows protected your PC" prompt, hit "More info" then "Run anyway". You should be greeted with the following window:

![WPILib Install Window](assets/WPILibGreeting#only-light)
![WPILib Install Window](assets/WPILibGreeting#only-dark)


## Installing Git
422, and most organizations around the world use Github to store their code. Similar to Google Docs, Github is a repository where code it stored so that everyone can access it. Git is a command line tool that will allow us to pull the code from the online Github repository onto our own machine so that we can edit the code.

### Windows
Go [here](https://git-scm.com/downloads/win) and download the __Git for Windows/x64 Setup__ option.

### MacBooks
??? info "MacBooks"
    Most MacBooks today ship with Git already installed. If you are unsure if you have it, skip this step and move to [testing Git](#testing-wpilib-and-git) to check it out.

MacBooks without Git already installed will need to install Homebrew first.
Open your terminal and paste the following line into it and hit enter:
```{ .yaml .copy }
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Once you finish installing Homebrew, paste the following line into the temrinal and hit enter:
```{ .yaml .copy }
brew install git
```

You should now have Git installed.



## Testing WPILib and Git

This is the final step. Once you have both WPILib and Git installed, you can test Git. 

Open WPILib VS Code. On Windows, this comes in the search window as __VS Code__, not __VSCode__. Once you open it, you should be presented with something similar to this screen:

![VS Code](assets/WPILibVSCode.png#only-light)
![VS Code](assets/WPILibVSCodeDark.png#only-dark)

Hit Ctrl+Shift+~ to enter the terminal (CMD+Shift+~ on MacBooks). Type the following and hit enter to check if git is working:
```
git --version
```
If you get something similar to below, Git is working.
```
git version 2.51.0.windows.1
```

---

!!! success "Finished" 
    If you have successfully installed WPILib and Git and ensured Git is working, you are set to code for 422!